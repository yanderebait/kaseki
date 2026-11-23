import { getDb } from './connection'
import { expandEvents } from './events'
import type { UpcomingItem } from '../../shared/widgets'

// Feeds the Upcoming widget (v0.3.0): what needs attention soon, across every
// active space, in one chronological list —
//   - tasks with a due date that is overdue or falls within the window, that
//     are neither Done nor archived;
//   - calendar occurrences starting within the window (or already running)
//     that aren't marked complete.
// Tasks and events in an archived space are left out, like everywhere else an
// archived space is hidden. Overdue tasks sort first, oldest first.

const pad = (n: number): string => String(n).padStart(2, '0')

function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

interface DueRow {
  id: number
  title: string
  dueDate: string
  spaceId: number
  spaceName: string
  accentColor: string | null
}

export function listUpcoming(now: Date = new Date(), days = 7, limit = 12): UpcomingItem[] {
  const db = getDb()
  const today = localDate(now)
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 23, 59, 59)
  const lastDay = localDate(horizon)

  // Due dates are stored as bare 'YYYY-MM-DD' (or a full ISO timestamp from
  // older rows); the first ten characters are the calendar date either way.
  const taskRows = db
    .prepare(
      `SELECT t.id, t.title, substr(t.due_date, 1, 10) AS dueDate, t.space_id AS spaceId,
        s.name AS spaceName, s.accent_color AS accentColor
       FROM tasks t JOIN spaces s ON s.id = t.space_id
       WHERE t.archived = 0 AND s.archived = 0
         AND t.due_date IS NOT NULL AND t.due_date != ''
         AND (t.status IS NULL OR t.status != 'Done')
         AND substr(t.due_date, 1, 10) <= ?
       ORDER BY dueDate ASC, t.id ASC`
    )
    .all(lastDay) as DueRow[]

  const items: UpcomingItem[] = taskRows.map((r) => ({
    kind: 'task',
    id: r.id,
    title: r.title,
    when: r.dueDate,
    allDay: true,
    overdue: r.dueDate < today,
    spaceId: r.spaceId,
    spaceName: r.spaceName,
    accentColor: r.accentColor
  }))

  const archivedSpaces = new Set(
    (db.prepare('SELECT id FROM spaces WHERE archived = 1').all() as Array<{ id: number }>).map(
      (r) => r.id
    )
  )
  const spaceNames = new Map(
    (db.prepare('SELECT id, name FROM spaces').all() as Array<{ id: number; name: string }>).map(
      (r) => [r.id, r.name]
    )
  )
  for (const o of expandEvents(now.toISOString(), horizon.toISOString())) {
    if (o.completed) continue
    if (o.spaceId != null && archivedSpaces.has(o.spaceId)) continue
    items.push({
      kind: 'event',
      id: o.masterId,
      title: o.title,
      when: o.occurrenceStart,
      allDay: o.allDay,
      overdue: false,
      spaceId: o.spaceId,
      spaceName: o.spaceId != null ? (spaceNames.get(o.spaceId) ?? null) : null,
      accentColor: o.accent
    })
  }

  // One timeline: a task's due date sorts as the start of that local day, so a
  // task due today sits above today's 14:00 event, and overdue tasks lead.
  const sortKey = (i: UpcomingItem): number =>
    i.kind === 'task'
      ? new Date(`${i.when}T00:00:00`).getTime()
      : new Date(i.when).getTime()
  items.sort((a, b) => sortKey(a) - sortKey(b) || a.title.localeCompare(b.title))
  return items.slice(0, limit)
}

// Counts for the daily notification summary: tasks due today and tasks
// overdue, with the same Done / archived exclusions as the widget.
export function dueCounts(now: Date = new Date()): { dueToday: number; overdue: number } {
  const today = localDate(now)
  const row = getDb()
    .prepare(
      `SELECT
        coalesce(sum(CASE WHEN substr(t.due_date, 1, 10) = ? THEN 1 ELSE 0 END), 0) AS dueToday,
        coalesce(sum(CASE WHEN substr(t.due_date, 1, 10) < ? THEN 1 ELSE 0 END), 0) AS overdue
       FROM tasks t JOIN spaces s ON s.id = t.space_id
       WHERE t.archived = 0 AND s.archived = 0
         AND t.due_date IS NOT NULL AND t.due_date != ''
         AND (t.status IS NULL OR t.status != 'Done')`
    )
    .get(today, today) as { dueToday: number; overdue: number }
  return row
}
