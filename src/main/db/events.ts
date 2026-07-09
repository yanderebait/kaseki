import { getDb } from './connection'
import {
  capRuleBefore,
  isValidTz,
  machineTz,
  occurrencesBetween,
  shiftInstantByWallDelta
} from '../recur'
import { log } from '../logger'
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
  tz: string | null
}

// The zone an event recurs in. Rows predating migration 008 (or with a zone
// Intl doesn't recognise) fall back to the machine's current zone rather than
// breaking expansion.
function rowTz(row: EventRow): string {
  return isValidTz(row.tz) ? row.tz : machineTz()
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
    completed: !!row.completed,
    tz: rowTz(row)
  }
}

export function getEvent(id: number): CalendarEvent | null {
  const row = getDb().prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined
  return row ? toEvent(row) : null
}

export function createEvent(input: NewEvent): CalendarEvent {
  const result = getDb()
    .prepare(
      `INSERT INTO events (space_id, title, description, start_at, end_at, all_day, location, recurrence_rule, tz)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.spaceId ?? null,
      input.title,
      input.description ?? null,
      input.start,
      input.end ?? null,
      input.allDay ? 1 : 0,
      input.location ?? null,
      input.recurrenceRule ?? null,
      isValidTz(input.tz) ? input.tz : machineTz()
    )
  return getEvent(Number(result.lastInsertRowid))!
}

// Edits the whole event / series (the master row).
//
// A series' exception children (per-occurrence edits, cancellations,
// completions) are keyed by original_start_at — the exact slot instant they
// replace. In 0.1.0 an "All events" edit that moved the start rewrote the
// slot grid and silently detached every exception, so cancelled occurrences
// came back from the dead. Now:
//   - start moved, recurrence rule textually unchanged → every child's slot
//     key (and, for cancellation/completion markers, its start) shifts by the
//     same wall-clock delta, so exceptions stay attached;
//   - recurrence rule changed → the old slots are meaningless, so the
//     children are deleted deliberately (and loggably) instead of silently
//     orphaned.
export function updateEvent(id: number, patch: NewEvent): void {
  const db = getDb()
  const before = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined
  if (!before) return
  const newTz = isValidTz(patch.tz) ? patch.tz : rowTz(before)
  db.transaction(() => {
    db.prepare(
      `UPDATE events SET space_id = ?, title = ?, description = ?, start_at = ?, end_at = ?,
        all_day = ?, location = ?, recurrence_rule = ?, tz = ? WHERE id = ?`
    ).run(
      patch.spaceId ?? null,
      patch.title,
      patch.description ?? null,
      patch.start,
      patch.end ?? null,
      patch.allDay ? 1 : 0,
      patch.location ?? null,
      patch.recurrenceRule ?? null,
      newTz,
      id
    )

    if (!before.recurrence_rule) return
    const ruleChanged = (patch.recurrenceRule ?? null) !== before.recurrence_rule
    const tzChanged = newTz !== rowTz(before)
    if (ruleChanged || tzChanged || !patch.recurrenceRule) {
      const dropped = db
        .prepare('DELETE FROM events WHERE recurrence_parent_id = ?')
        .run(id).changes
      if (dropped > 0) log.info('Series rule changed; dropped exception children', { id, dropped })
      return
    }
    if (patch.start !== before.start_at) {
      const children = db
        .prepare('SELECT id, start_at, original_start_at FROM events WHERE recurrence_parent_id = ?')
        .all(id) as Array<{ id: number; start_at: string; original_start_at: string | null }>
      const write = db.prepare(
        'UPDATE events SET original_start_at = ?, start_at = ? WHERE id = ?'
      )
      for (const c of children) {
        if (!c.original_start_at) continue
        const newKey = shiftInstantByWallDelta(c.original_start_at, newTz, before.start_at, patch.start)
        // Cancellation/completion markers sit exactly on their slot and move
        // with it; a user-edited override keeps its own edited start.
        const newStart = c.start_at === c.original_start_at ? newKey : c.start_at
        write.run(newKey, newStart, c.id)
      }
    }
  })()
}

// Deletes an event and, if it is a series master, its override/exception
// children — plus any cross-links pointing at it, which previously lingered
// as "(deleted event)" rows forever.
export function deleteEvent(id: number): void {
  getDb()
    .transaction(() => {
      getDb().prepare('DELETE FROM events WHERE recurrence_parent_id = ?').run(id)
      getDb().prepare('DELETE FROM events WHERE id = ?').run(id)
      getDb()
        .prepare(
          "DELETE FROM links WHERE (source_type = 'event' AND source_id = ?) OR (target_type = 'event' AND target_id = ?)"
        )
        .run(id, id)
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
//
// v0.2.0 semantics:
//   - recurrence fires at the master's wall-clock time in its own timezone
//     (events.tz), so occurrences no longer drift an hour across DST;
//   - an event *intersecting* the range is included, not only one *starting*
//     in it — a 23:00–01:00 session now shows on both days, and something
//     started before the window that is still running shows today;
//   - one malformed rule no longer takes the whole calendar down: expansion
//     failures are logged per-master and skipped.
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
    const durationMs = master.end_at
      ? new Date(master.end_at).getTime() - new Date(master.start_at).getTime()
      : 0

    if (!master.recurrence_rule) {
      if (master.cancelled) continue
      const start = new Date(master.start_at)
      const end = new Date(start.getTime() + Math.max(0, durationMs))
      if (start <= rangeEnd && end >= rangeStart) {
        out.push(occurrenceFromRow(master, master, master.start_at, accents, null))
      }
      continue
    }

    let slots: Date[]
    try {
      // Search back by the event's own duration so an occurrence that starts
      // before the window but ends inside it is still found.
      const lookback = new Date(rangeStart.getTime() - Math.max(0, durationMs))
      slots = occurrencesBetween(
        master.recurrence_rule,
        master.start_at,
        rowTz(master),
        lookback,
        rangeEnd
      )
    } catch (error) {
      log.error('Recurrence expansion failed; skipping event', { id: master.id, error: String(error) })
      continue
    }

    for (const slot of slots) {
      const slotISO = slot.toISOString()
      const child = childMap.get(`${master.id}|${slotISO}`)
      if (child) {
        if (child.cancelled) continue
        const childEnd = child.end_at ? new Date(child.end_at) : new Date(child.start_at)
        if (new Date(child.start_at) > rangeEnd || childEnd < rangeStart) continue
        out.push(occurrenceFromRow(child, master, slotISO, accents, child.id))
      } else {
        const end = new Date(slot.getTime() + Math.max(0, durationMs))
        if (slot > rangeEnd || end < rangeStart) continue
        out.push({
          masterId: master.id,
          occurrenceStart: slotISO,
          originalStart: slotISO,
          overrideId: null,
          recurring: true,
          title: master.title,
          description: master.description,
          end: master.end_at ? end.toISOString() : null,
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
// future); call inside a transaction. The cap preserves every other rule
// component (FREQ, INTERVAL, BYxxx) via capRuleBefore.
function endSeriesBefore(master: EventRow, fromOriginalStartISO: string): void {
  const db = getDb()
  const untilRule = capRuleBefore(master.recurrence_rule as string, rowTz(master), fromOriginalStartISO)
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
      `INSERT INTO events (space_id, title, description, start_at, end_at, all_day, location, recurrence_rule, tz)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      values.spaceId ?? null,
      values.title,
      values.description ?? null,
      values.start,
      values.end ?? null,
      values.allDay ? 1 : 0,
      values.location ?? null,
      values.recurrenceRule ?? master.recurrence_rule,
      isValidTz(values.tz) ? values.tz : rowTz(master)
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
    // The marker's end is this occurrence's own end — the slot plus the
    // series' duration — not the master's first-ever end, which produced
    // occurrences that "ended" weeks before they started.
    const durationMs = master.end_at
      ? new Date(master.end_at).getTime() - new Date(master.start_at).getTime()
      : 0
    const end = master.end_at
      ? new Date(new Date(originalStartISO).getTime() + Math.max(0, durationMs)).toISOString()
      : null
    db.prepare(
      `INSERT INTO events (space_id, title, description, start_at, end_at, all_day, location,
        recurrence_parent_id, original_start_at, completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      master.space_id,
      master.title,
      master.description,
      originalStartISO,
      end,
      master.all_day,
      master.location,
      masterId,
      originalStartISO,
      completed ? 1 : 0
    )
  }
}
