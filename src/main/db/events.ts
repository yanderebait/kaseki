import { RRule } from 'rrule'
import { getDb } from './connection'
import type { CalendarEvent, EventOccurrence, NewEvent } from '../../shared/types'

interface EventRow {
  id: number
  space_id: number | null
  title: string
  description: string | null
  start_at: string
  end_at: string | null
  all_day: number
  location: string | null
  recurrence_rule: string | null
  recurrence_parent_id: number | null
  original_start_at: string | null
  cancelled: number
  completed: number
}

function toEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    spaceId: row.space_id,
    title: row.title,
    description: row.description,
    start: row.start_at,
    end: row.end_at,
    allDay: !!row.all_day,
    location: row.location,
    recurrenceRule: row.recurrence_rule,
    completed: !!row.completed
  }
}

export function getEvent(id: number): CalendarEvent | null {
  const row = getDb().prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined
  return row ? toEvent(row) : null
}

export function createEvent(input: NewEvent): CalendarEvent {
  const result = getDb()
    .prepare(
      `INSERT INTO events (space_id, title, description, start_at, end_at, all_day, location, recurrence_rule)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.spaceId ?? null,
      input.title,
      input.description ?? null,
      input.start,
      input.end ?? null,
      input.allDay ? 1 : 0,
      input.location ?? null,
      input.recurrenceRule ?? null
    )
  return getEvent(Number(result.lastInsertRowid))!
}

// Edits the whole event / series (the master row).
export function updateEvent(id: number, patch: NewEvent): void {
  getDb()
    .prepare(
      `UPDATE events SET space_id = ?, title = ?, description = ?, start_at = ?, end_at = ?,
        all_day = ?, location = ?, recurrence_rule = ? WHERE id = ?`
    )
    .run(
      patch.spaceId ?? null,
      patch.title,
      patch.description ?? null,
      patch.start,
      patch.end ?? null,
      patch.allDay ? 1 : 0,
      patch.location ?? null,
      patch.recurrenceRule ?? null,
      id
    )
}

// Deletes an event and, if it is a series master, its override/exception
// children.
export function deleteEvent(id: number): void {
  getDb()
    .transaction(() => {
      getDb().prepare('DELETE FROM events WHERE recurrence_parent_id = ?').run(id)
      getDb().prepare('DELETE FROM events WHERE id = ?').run(id)
    })()
}

function spaceAccents(): Map<number, string | null> {
  const rows = getDb().prepare('SELECT id, accent_color FROM spaces').all() as {
    id: number
    accent_color: string | null
  }[]
  return new Map(rows.map((r) => [r.id, r.accent_color]))
}

function occurrenceFromRow(
  row: EventRow,
  master: EventRow,
  originalStart: string,
  accents: Map<number, string | null>,
  overrideId: number | null
): EventOccurrence {
  return {
    masterId: master.id,
    occurrenceStart: row.start_at,
    originalStart,
    overrideId,
    recurring: !!master.recurrence_rule,
    title: row.title,
    description: row.description,
    end: row.end_at,
    allDay: !!row.all_day,
    location: row.location,
    spaceId: row.space_id,
    accent: row.space_id != null ? (accents.get(row.space_id) ?? null) : null,
    completed: !!row.completed
  }
}

// Expands every master into concrete occurrences within [rangeStart,
// rangeEnd], applying overrides and skipping cancellations. spaceId filters
// to that space plus Global (NULL) events; omit it for the home strip.
export function expandEvents(
  rangeStartISO: string,
  rangeEndISO: string,
  spaceId?: number | null
): EventOccurrence[] {
  const db = getDb()
  const rangeStart = new Date(rangeStartISO)
  const rangeEnd = new Date(rangeEndISO)

  const masters = (
    spaceId == null
      ? db.prepare('SELECT * FROM events WHERE recurrence_parent_id IS NULL').all()
      : db
          .prepare(
            'SELECT * FROM events WHERE recurrence_parent_id IS NULL AND (space_id = ? OR space_id IS NULL)'
          )
          .all(spaceId)
  ) as EventRow[]

  const children = db
    .prepare('SELECT * FROM events WHERE recurrence_parent_id IS NOT NULL')
    .all() as EventRow[]
  const childMap = new Map<string, EventRow>()
  for (const c of children) childMap.set(`${c.recurrence_parent_id}|${c.original_start_at}`, c)

  const accents = spaceAccents()
  const out: EventOccurrence[] = []

  for (const master of masters) {
    if (!master.recurrence_rule) {
      if (master.cancelled) continue
      const start = new Date(master.start_at)
      if (start >= rangeStart && start <= rangeEnd) {
        out.push(occurrenceFromRow(master, master, master.start_at, accents, null))
      }
      continue
    }

    const opts = RRule.parseString(master.recurrence_rule)
    opts.dtstart = new Date(master.start_at)
    const rule = new RRule(opts)
    const durationMs = master.end_at
      ? new Date(master.end_at).getTime() - new Date(master.start_at).getTime()
      : 0

    for (const slot of rule.between(rangeStart, rangeEnd, true)) {
      const slotISO = slot.toISOString()
      const child = childMap.get(`${master.id}|${slotISO}`)
      if (child) {
        if (child.cancelled) continue
        out.push(occurrenceFromRow(child, master, slotISO, accents, child.id))
      } else {
        out.push({
          masterId: master.id,
          occurrenceStart: slotISO,
          originalStart: slotISO,
          overrideId: null,
          recurring: true,
          title: master.title,
          description: master.description,
          end: master.end_at ? new Date(slot.getTime() + durationMs).toISOString() : null,
          allDay: !!master.all_day,
          location: master.location,
          spaceId: master.space_id,
          accent: master.space_id != null ? (accents.get(master.space_id) ?? null) : null,
          completed: false
        })
      }
    }
  }

  out.sort((a, b) => a.occurrenceStart.localeCompare(b.occurrenceStart))
  return out
}

// Upserts an override child for one occurrence ("this occurrence"). The
// child carries the full (edited) event values keyed by the series slot.
export function setOverride(masterId: number, originalStartISO: string, values: NewEvent): void {
  const db = getDb()
  const existing = db
    .prepare('SELECT id FROM events WHERE recurrence_parent_id = ? AND original_start_at = ?')
    .get(masterId, originalStartISO) as { id: number } | undefined
  if (existing) {
    db.prepare(
      `UPDATE events SET title = ?, description = ?, start_at = ?, end_at = ?, all_day = ?,
        location = ?, space_id = ?, cancelled = 0 WHERE id = ?`
    ).run(
      values.title,
      values.description ?? null,
      values.start,
      values.end ?? null,
      values.allDay ? 1 : 0,
      values.location ?? null,
      values.spaceId ?? null,
      existing.id
    )
  } else {
    db.prepare(
      `INSERT INTO events (space_id, title, description, start_at, end_at, all_day, location,
        recurrence_parent_id, original_start_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      values.spaceId ?? null,
      values.title,
      values.description ?? null,
      values.start,
      values.end ?? null,
      values.allDay ? 1 : 0,
      values.location ?? null,
      masterId,
      originalStartISO
    )
  }
}

// Marks one occurrence as deleted ("delete this occurrence") via a cancelled
// exception child.
export function cancelOccurrence(masterId: number, originalStartISO: string): void {
  const db = getDb()
  const master = db.prepare('SELECT title FROM events WHERE id = ?').get(masterId) as
    | { title: string }
    | undefined
  if (!master) return
  const existing = db
    .prepare('SELECT id FROM events WHERE recurrence_parent_id = ? AND original_start_at = ?')
    .get(masterId, originalStartISO) as { id: number } | undefined
  if (existing) {
    db.prepare('UPDATE events SET cancelled = 1 WHERE id = ?').run(existing.id)
  } else {
    db.prepare(
      `INSERT INTO events (title, start_at, recurrence_parent_id, original_start_at, cancelled)
       VALUES (?, ?, ?, ?, 1)`
    ).run(master.title, originalStartISO, masterId, originalStartISO)
  }
}

// Caps the master series so it stops the moment before fromOriginalStart,
// and drops any override/exception children at or after the cut. Shared by
// splitSeries (edit this-and-future) and truncateSeries (delete this-and-
// future); call inside a transaction.
function endSeriesBefore(master: EventRow, fromOriginalStartISO: string): void {
  const db = getDb()
  const opts = RRule.parseString(master.recurrence_rule as string)
  opts.dtstart = new Date(master.start_at)
  opts.until = new Date(new Date(fromOriginalStartISO).getTime() - 1000)
  const untilRule = RRule.optionsToString(opts).replace(/^.*RRULE:/s, '')
  db.prepare('UPDATE events SET recurrence_rule = ? WHERE id = ?').run(untilRule, master.id)
  db.prepare('DELETE FROM events WHERE recurrence_parent_id = ? AND original_start_at >= ?').run(
    master.id,
    fromOriginalStartISO
  )
}

// "This and all future": ends the master series the moment before this
// occurrence and starts a new series from it with the edited values.
export function splitSeries(masterId: number, fromOriginalStartISO: string, values: NewEvent): void {
  const db = getDb()
  const master = db.prepare('SELECT * FROM events WHERE id = ?').get(masterId) as EventRow | undefined
  if (!master || !master.recurrence_rule) return
  db.transaction(() => {
    endSeriesBefore(master, fromOriginalStartISO)
    db.prepare(
      `INSERT INTO events (space_id, title, description, start_at, end_at, all_day, location, recurrence_rule)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      values.spaceId ?? null,
      values.title,
      values.description ?? null,
      values.start,
      values.end ?? null,
      values.allDay ? 1 : 0,
      values.location ?? null,
      values.recurrenceRule ?? master.recurrence_rule
    )
  })()
}

// "Delete this and all future": ends the master series before this
// occurrence without starting a replacement.
export function truncateSeries(masterId: number, fromOriginalStartISO: string): void {
  const db = getDb()
  const master = db.prepare('SELECT * FROM events WHERE id = ?').get(masterId) as EventRow | undefined
  if (!master || !master.recurrence_rule) return
  db.transaction(() => endSeriesBefore(master, fromOriginalStartISO))()
}

export function setOccurrenceCompleted(
  masterId: number,
  originalStartISO: string,
  completed: boolean
): void {
  const db = getDb()
  const master = db.prepare('SELECT * FROM events WHERE id = ?').get(masterId) as EventRow | undefined
  if (!master) return
  if (!master.recurrence_rule) {
    db.prepare('UPDATE events SET completed = ? WHERE id = ?').run(completed ? 1 : 0, masterId)
    return
  }
  const existing = db
    .prepare('SELECT id FROM events WHERE recurrence_parent_id = ? AND original_start_at = ?')
    .get(masterId, originalStartISO) as { id: number } | undefined
  if (existing) {
    db.prepare('UPDATE events SET completed = ? WHERE id = ?').run(completed ? 1 : 0, existing.id)
  } else {
    db.prepare(
      `INSERT INTO events (space_id, title, description, start_at, end_at, all_day, location,
        recurrence_parent_id, original_start_at, completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      master.space_id,
      master.title,
      master.description,
      originalStartISO,
      master.end_at,
      master.all_day,
      master.location,
      masterId,
      originalStartISO,
      completed ? 1 : 0
    )
  }
}
