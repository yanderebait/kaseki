import { getDb } from './connection'
import { getPreferences } from './prefs'
import { getFile } from './files'
import type {
  ActivityEntry,
  BillingMode,
  DependencyResult,
  FileRecord,
  KnowledgeContent,
  NewTask,
  NewTimeEntry,
  Subtask,
  Tag,
  Task,
  TaskDetail,
  TaskFieldValue,
  TaskPatch,
  TaskSummary,
  TaskTemplate,
  TimeEntry,
  TimeEntryPatch,
  TimeReportOptions,
  TimeReportRow
} from '../../shared/types'

// Records a task activity-log entry (Part 7). Visible in the task's Activity
// tab and the home screen's global feed.
function logTaskActivity(
  taskId: number,
  action: string,
  oldValue?: string | null,
  newValue?: string | null
): void {
  getDb()
    .prepare(
      'INSERT INTO activity_log (item_type, item_id, action, old_value, new_value) VALUES (?, ?, ?, ?, ?)'
    )
    .run('task', taskId, action, oldValue ?? null, newValue ?? null)
}

// Task data layer (Part 7). Core CRUD plus subtasks, free-form tags, and
// per-space custom field values. Dependencies, notes, file attachments, the
// activity log, and time tracking are layered on in the next commit; their
// hooks (blocked, timeTracked) are present here and resolve to false/0 until
// then. Search and the stale signal back the dashboard task list (Part 6).

const DEFAULT_STALE_DAYS = 14

// Days since a date string (SQLite's 'YYYY-MM-DD HH:MM:SS', stored in UTC).
function daysSince(ts: string): number {
  const ms = Date.parse(ts.replace(' ', 'T') + 'Z')
  if (Number.isNaN(ms)) return 0
  return Math.floor((Date.now() - ms) / 86_400_000)
}

function staleThreshold(): number {
  const v = getPreferences().staleThresholdDays
  return typeof v === 'number' && v > 0 ? v : DEFAULT_STALE_DAYS
}

interface TaskRow {
  id: number
  spaceId: number
  title: string
  description: string | null
  status: string | null
  priority: Task['priority']
  pinned: number
  archived: number
  dueDate: string | null
  estimatedTime: number | null
  billingMode: BillingMode | null
  billingRate: number | null
  billingUnits: number | null
  createdAt: string
  updatedAt: string
}

const SELECT_TASK = `
  SELECT id, space_id AS spaceId, title, description, status, priority,
    pinned, archived, due_date AS dueDate, estimated_time AS estimatedTime,
    billing_mode AS billingMode, billing_rate AS billingRate, billing_units AS billingUnits,
    created_at AS createdAt, updated_at AS updatedAt
  FROM tasks
`

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    spaceId: r.spaceId,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    pinned: r.pinned === 1,
    archived: r.archived === 1,
    dueDate: r.dueDate,
    estimatedTime: r.estimatedTime,
    billingMode: r.billingMode,
    billingRate: r.billingRate,
    billingUnits: r.billingUnits,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }
}

export function createTask(input: NewTask): Task {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO tasks (space_id, title, description, status, priority, due_date, estimated_time)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.spaceId,
      input.title,
      input.description ?? null,
      input.status ?? null,
      input.priority ?? null,
      input.dueDate ?? null,
      input.estimatedTime ?? null
    )
  const id = Number(result.lastInsertRowid)
  logTaskActivity(id, 'created')
  return getTask(id)!
}

export function getTask(id: number): Task | null {
  const row = getDb().prepare(`${SELECT_TASK} WHERE id = ?`).get(id) as TaskRow | undefined
  return row ? rowToTask(row) : null
}

export function updateTask(id: number, patch: TaskPatch): void {
  const before = getTask(id)
  const sets: string[] = []
  const vals: unknown[] = []
  const add = (col: string, val: unknown): void => {
    sets.push(`${col} = ?`)
    vals.push(val)
  }
  if (patch.title !== undefined) add('title', patch.title)
  if (patch.description !== undefined) add('description', patch.description)
  if (patch.status !== undefined) add('status', patch.status)
  if (patch.priority !== undefined) add('priority', patch.priority)
  if (patch.pinned !== undefined) add('pinned', patch.pinned ? 1 : 0)
  if (patch.archived !== undefined) add('archived', patch.archived ? 1 : 0)
  if (patch.dueDate !== undefined) add('due_date', patch.dueDate)
  if (patch.estimatedTime !== undefined) add('estimated_time', patch.estimatedTime)
  if (patch.billingMode !== undefined) add('billing_mode', patch.billingMode)
  if (patch.billingRate !== undefined) add('billing_rate', patch.billingRate)
  if (patch.billingUnits !== undefined) add('billing_units', patch.billingUnits)
  if (sets.length === 0) return
  sets.push('updated_at = CURRENT_TIMESTAMP')
  getDb()
    .prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`)
    .run(...vals, id)

  // Log the meaningful changes for the activity history.
  if (before) {
    if (patch.status !== undefined && patch.status !== before.status) {
      logTaskActivity(id, 'status changed', before.status, patch.status)
    }
    if (patch.archived !== undefined && patch.archived !== before.archived) {
      logTaskActivity(id, patch.archived ? 'archived' : 'unarchived')
    }
    const otherEdit =
      patch.title !== undefined ||
      patch.description !== undefined ||
      patch.priority !== undefined ||
      patch.dueDate !== undefined ||
      patch.estimatedTime !== undefined ||
      patch.billingMode !== undefined ||
      patch.billingRate !== undefined ||
      patch.billingUnits !== undefined
    if (otherEdit) logTaskActivity(id, 'edited')
  }
}

// Whether adding upstream→downstream stays acyclic: it does unless `downstream`
// can already reach `upstream` along the existing block edges (Part 7 DAG).
function canReach(start: number, target: number): boolean {
  const d = getDb()
  const seen = new Set<number>()
  const stack = [start]
  const step = d.prepare('SELECT downstream_id AS id FROM task_dependencies WHERE upstream_id = ?')
  while (stack.length > 0) {
    const cur = stack.pop()!
    if (cur === target) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const row of step.all(cur) as Array<{ id: number }>) stack.push(row.id)
  }
  return false
}

// Add a dependency (upstream blocks downstream), refusing self-links and cycles.
export function addDependency(upstreamId: number, downstreamId: number): DependencyResult {
  if (upstreamId === downstreamId) return { ok: false, error: 'A task can’t depend on itself.' }
  if (canReach(downstreamId, upstreamId)) {
    return { ok: false, error: 'That would create a circular dependency.' }
  }
  getDb()
    .prepare('INSERT OR IGNORE INTO task_dependencies (upstream_id, downstream_id) VALUES (?, ?)')
    .run(upstreamId, downstreamId)
  logTaskActivity(downstreamId, 'dependency added')
  touchTask(downstreamId)
  return { ok: true }
}

export function removeDependency(upstreamId: number, downstreamId: number): void {
  getDb()
    .prepare('DELETE FROM task_dependencies WHERE upstream_id = ? AND downstream_id = ?')
    .run(upstreamId, downstreamId)
  touchTask(downstreamId)
}

// Tasks (in the space) with at least one unfinished upstream dependency.
function blockedIds(spaceId: number): Set<number> {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT dep.downstream_id AS id
       FROM task_dependencies dep
       JOIN tasks u ON u.id = dep.upstream_id
       JOIN tasks dn ON dn.id = dep.downstream_id
       WHERE dn.space_id = ? AND u.archived = 0 AND (u.status IS NULL OR u.status != 'Done')`
    )
    .all(spaceId) as Array<{ id: number }>
  return new Set(rows.map((r) => r.id))
}

// Count of a task's incomplete upstream dependencies (for the Done warning).
export function incompleteBlockerCount(taskId: number): number {
  const row = getDb()
    .prepare(
      `SELECT count(*) AS n FROM task_dependencies dep JOIN tasks u ON u.id = dep.upstream_id
       WHERE dep.downstream_id = ? AND u.archived = 0 AND (u.status IS NULL OR u.status != 'Done')`
    )
    .get(taskId) as { n: number }
  return row.n
}

// Move a task to another space. Custom field values belong to the old space's
// definitions, so they're cleared (Part 7's cross-space-move caveat).
export function moveTask(id: number, newSpaceId: number): void {
  const d = getDb()
  d.transaction(() => {
    d.prepare('DELETE FROM custom_field_values WHERE task_id = ?').run(id)
    d.prepare('UPDATE tasks SET space_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      newSpaceId,
      id
    )
  })()
  logTaskActivity(id, 'moved')
}

// Hard delete with manual cascade (the schema has no ON DELETE CASCADE).
export function deleteTask(id: number): void {
  const d = getDb()
  d.transaction(() => {
    d.prepare('DELETE FROM custom_field_values WHERE task_id = ?').run(id)
    d.prepare('DELETE FROM task_tags WHERE task_id = ?').run(id)
    d.prepare('DELETE FROM task_files WHERE task_id = ?').run(id)
    d.prepare('DELETE FROM subtasks WHERE task_id = ?').run(id)
    d.prepare('DELETE FROM task_notes WHERE task_id = ?').run(id)
    d.prepare('DELETE FROM time_entries WHERE task_id = ?').run(id)
    d.prepare('DELETE FROM task_dependencies WHERE upstream_id = ? OR downstream_id = ?').run(id, id)
    d.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  })()
}

// Enrich a set of task rows (all from one space) with tags, subtask counts, and
// the stale signal, in a few grouped queries rather than per-task.
function buildSummaries(spaceId: number, rows: TaskRow[]): TaskSummary[] {
  const d = getDb()
  const threshold = staleThreshold()
  const blocked = blockedIds(spaceId)

  const subRows = d
    .prepare(
      `SELECT s.task_id AS taskId, count(*) AS total, sum(s.completed) AS done
       FROM subtasks s JOIN tasks t ON t.id = s.task_id
       WHERE t.space_id = ? GROUP BY s.task_id`
    )
    .all(spaceId) as Array<{ taskId: number; total: number; done: number }>
  const subs = new Map(subRows.map((r) => [r.taskId, r]))

  const tagRows = d
    .prepare(
      `SELECT tt.task_id AS taskId, g.id, g.name, g.color
       FROM task_tags tt JOIN tags g ON g.id = tt.tag_id JOIN tasks t ON t.id = tt.task_id
       WHERE t.space_id = ? ORDER BY g.name`
    )
    .all(spaceId) as Array<{ taskId: number; id: number; name: string; color: string | null }>
  const tags = new Map<number, Tag[]>()
  for (const r of tagRows) {
    const list = tags.get(r.taskId) ?? []
    list.push({ id: r.id, name: r.name, color: r.color })
    tags.set(r.taskId, list)
  }

  return rows.map((r) => {
    const task = rowToTask(r)
    const sub = subs.get(r.id)
    const staleDays = daysSince(r.updatedAt)
    return {
      ...task,
      tags: tags.get(r.id) ?? [],
      subtaskCount: sub?.total ?? 0,
      subtaskDone: sub?.done ?? 0,
      staleDays,
      stale: !task.archived && task.status !== 'Done' && staleDays > threshold,
      blocked: blocked.has(r.id)
    }
  })
}

// Pinned first, then by due date (undated last), then most recently updated.
export function listTasks(spaceId: number): TaskSummary[] {
  const rows = getDb()
    .prepare(
      `${SELECT_TASK} WHERE space_id = ? AND archived = 0
       ORDER BY pinned DESC, (due_date IS NULL), due_date ASC, updated_at DESC`
    )
    .all(spaceId) as TaskRow[]
  return buildSummaries(spaceId, rows)
}

// Scoped search (Part 6): matches task titles, descriptions, and subtask titles
// within the space. (Notes join in the next commit.)
export function searchTasks(spaceId: number, query: string): TaskSummary[] {
  const q = query.trim()
  if (q === '') return listTasks(spaceId)
  const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`
  const rows = getDb()
    .prepare(
      `${SELECT_TASK}
       WHERE space_id = ? AND archived = 0 AND (
         title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\'
         OR EXISTS (SELECT 1 FROM subtasks s WHERE s.task_id = tasks.id AND s.title LIKE ? ESCAPE '\\')
       )
       ORDER BY pinned DESC, (due_date IS NULL), due_date ASC, updated_at DESC`
    )
    .all(spaceId, like, like, like) as TaskRow[]
  return buildSummaries(spaceId, rows)
}

export function getTaskDetail(id: number): TaskDetail | null {
  const task = getTask(id)
  if (!task) return null
  const d = getDb()
  const blockers = (d
    .prepare(`${SELECT_TASK} WHERE id IN (SELECT upstream_id FROM task_dependencies WHERE downstream_id = ?)`)
    .all(id) as TaskRow[]).map(rowToTask)
  const blocking = (d
    .prepare(`${SELECT_TASK} WHERE id IN (SELECT downstream_id FROM task_dependencies WHERE upstream_id = ?)`)
    .all(id) as TaskRow[]).map(rowToTask)
  return {
    ...task,
    tags: listTaskTags(id),
    subtasks: listSubtasks(id),
    fields: listFieldValues(id),
    timeTracked: timeTrackedFor(id),
    timeEntries: listTimeEntries(id),
    blockers,
    blocking,
    files: listTaskFiles(id),
    note: getNote(id),
    activity: listTaskActivity(id)
  }
}

// --- Subtasks ---

export function listSubtasks(taskId: number): Subtask[] {
  return getDb()
    .prepare(
      'SELECT id, title, completed, position FROM subtasks WHERE task_id = ? ORDER BY position'
    )
    .all(taskId)
    .map((r) => {
      const row = r as { id: number; title: string; completed: number; position: number }
      return { id: row.id, title: row.title, completed: row.completed === 1, position: row.position }
    })
}

export function addSubtask(taskId: number, title: string): Subtask {
  const d = getDb()
  const { pos } = d
    .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM subtasks WHERE task_id = ?')
    .get(taskId) as { pos: number }
  const result = d
    .prepare('INSERT INTO subtasks (task_id, title, position) VALUES (?, ?, ?)')
    .run(taskId, title, pos)
  touchTask(taskId)
  logTaskActivity(taskId, 'subtask added')
  const id = Number(result.lastInsertRowid)
  return { id, title, completed: false, position: pos }
}

export function updateSubtask(id: number, patch: { title?: string; completed?: boolean }): void {
  const sets: string[] = []
  const vals: unknown[] = []
  if (patch.title !== undefined) {
    sets.push('title = ?')
    vals.push(patch.title)
  }
  if (patch.completed !== undefined) {
    sets.push('completed = ?')
    vals.push(patch.completed ? 1 : 0)
  }
  if (sets.length === 0) return
  getDb()
    .prepare(`UPDATE subtasks SET ${sets.join(', ')} WHERE id = ?`)
    .run(...vals, id)
  const owner = touchTaskOfSubtask(id)
  if (owner !== null && patch.completed === true) logTaskActivity(owner, 'subtask completed')
}

export function deleteSubtask(id: number): void {
  touchTaskOfSubtask(id)
  getDb().prepare('DELETE FROM subtasks WHERE id = ?').run(id)
}

// Swap a subtask with its neighbour in the given direction (-1 up, 1 down).
export function reorderSubtask(id: number, dir: -1 | 1): void {
  const d = getDb()
  const cur = d.prepare('SELECT task_id AS taskId, position FROM subtasks WHERE id = ?').get(id) as
    | { taskId: number; position: number }
    | undefined
  if (!cur) return
  const neighbour = d
    .prepare(
      `SELECT id, position FROM subtasks WHERE task_id = ? AND position ${dir < 0 ? '<' : '>'} ?
       ORDER BY position ${dir < 0 ? 'DESC' : 'ASC'} LIMIT 1`
    )
    .get(cur.taskId, cur.position) as { id: number; position: number } | undefined
  if (!neighbour) return
  d.transaction(() => {
    d.prepare('UPDATE subtasks SET position = ? WHERE id = ?').run(neighbour.position, id)
    d.prepare('UPDATE subtasks SET position = ? WHERE id = ?').run(cur.position, neighbour.id)
  })()
}

// --- Tags ---

export function listSpaceTags(spaceId: number): Tag[] {
  return getDb()
    .prepare(
      'SELECT id, name, color FROM tags WHERE space_id = ? OR global = 1 ORDER BY name'
    )
    .all(spaceId) as Tag[]
}

export function listTaskTags(taskId: number): Tag[] {
  return getDb()
    .prepare(
      `SELECT g.id, g.name, g.color FROM tags g
       JOIN task_tags tt ON tt.tag_id = g.id WHERE tt.task_id = ? ORDER BY g.name`
    )
    .all(taskId) as Tag[]
}

// Find-or-create a tag by name within the space (case-insensitive), so the same
// label isn't duplicated.
export function createTag(spaceId: number, name: string, color?: string | null): Tag {
  const d = getDb()
  const trimmed = name.trim()
  const existing = d
    .prepare(
      `SELECT id, name, color FROM tags
       WHERE (space_id = ? OR global = 1) AND lower(name) = lower(?) LIMIT 1`
    )
    .get(spaceId, trimmed) as Tag | undefined
  if (existing) return existing
  const result = d
    .prepare('INSERT INTO tags (name, color, space_id) VALUES (?, ?, ?)')
    .run(trimmed, color ?? null, spaceId)
  return { id: Number(result.lastInsertRowid), name: trimmed, color: color ?? null }
}

export function addTag(taskId: number, tagId: number): void {
  getDb().prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)').run(taskId, tagId)
  touchTask(taskId)
}

export function removeTag(taskId: number, tagId: number): void {
  getDb().prepare('DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?').run(taskId, tagId)
  touchTask(taskId)
}

// --- Custom field values ---

// All of the task's space's field definitions, each with the task's value.
export function listFieldValues(taskId: number): TaskFieldValue[] {
  const rows = getDb()
    .prepare(
      `SELECT d.id AS fieldId, d.name, d.field_type AS type, d.options, v.value
       FROM custom_field_definitions d
       LEFT JOIN custom_field_values v ON v.field_id = d.id AND v.task_id = ?
       WHERE d.space_id = (SELECT space_id FROM tasks WHERE id = ?)
       ORDER BY d.position`
    )
    .all(taskId, taskId) as Array<{
    fieldId: number
    name: string
    type: TaskFieldValue['type']
    options: string | null
    value: string | null
  }>
  return rows.map((r) => ({
    fieldId: r.fieldId,
    name: r.name,
    type: r.type,
    options: r.options ? (JSON.parse(r.options) as string[]) : undefined,
    value: r.value
  }))
}

// Upsert (or clear, when value is null/empty) a task's value for one field.
export function setFieldValue(taskId: number, fieldId: number, value: string | null): void {
  const d = getDb()
  d.prepare('DELETE FROM custom_field_values WHERE task_id = ? AND field_id = ?').run(taskId, fieldId)
  if (value !== null && value !== '') {
    d.prepare('INSERT INTO custom_field_values (task_id, field_id, value) VALUES (?, ?, ?)').run(
      taskId,
      fieldId,
      value
    )
  }
  touchTask(taskId)
}

// --- helpers ---

function touchTask(taskId: number): void {
  getDb().prepare('UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(taskId)
}

function touchTaskOfSubtask(subtaskId: number): number | null {
  const row = getDb().prepare('SELECT task_id AS taskId FROM subtasks WHERE id = ?').get(subtaskId) as
    | { taskId: number }
    | undefined
  if (!row) return null
  touchTask(row.taskId)
  return row.taskId
}

// --- Notes (single long-form rich-text note per task) ---

export function getNote(taskId: number): KnowledgeContent | null {
  const row = getDb()
    .prepare('SELECT content FROM task_notes WHERE task_id = ? ORDER BY id DESC LIMIT 1')
    .get(taskId) as { content: string | null } | undefined
  if (!row?.content) return null
  try {
    return JSON.parse(row.content) as KnowledgeContent
  } catch {
    return null
  }
}

export function saveNote(taskId: number, content: KnowledgeContent | null): void {
  const d = getDb()
  d.prepare('DELETE FROM task_notes WHERE task_id = ?').run(taskId)
  if (content !== null) {
    d.prepare('INSERT INTO task_notes (task_id, content) VALUES (?, ?)').run(
      taskId,
      JSON.stringify(content)
    )
    logTaskActivity(taskId, 'note updated')
    touchTask(taskId)
  }
}

// --- File attachments (reuse the content-addressed files store) ---

export function listTaskFiles(taskId: number): FileRecord[] {
  const ids = getDb()
    .prepare('SELECT file_id AS id FROM task_files WHERE task_id = ?')
    .all(taskId) as Array<{ id: number }>
  return ids.map((r) => getFile(r.id)).filter((f): f is FileRecord => f !== null)
}

export function linkFile(taskId: number, fileId: number): void {
  getDb()
    .prepare('INSERT OR IGNORE INTO task_files (task_id, file_id) VALUES (?, ?)')
    .run(taskId, fileId)
  logTaskActivity(taskId, 'file attached')
  touchTask(taskId)
}

export function unlinkFile(taskId: number, fileId: number): void {
  getDb().prepare('DELETE FROM task_files WHERE task_id = ? AND file_id = ?').run(taskId, fileId)
  touchTask(taskId)
}

// --- Time entries (the timer/manual-entry UI is Phase 10b; this is the data) ---

export function addTimeEntry(input: NewTimeEntry): TimeEntry {
  const result = getDb()
    .prepare(
      `INSERT INTO time_entries (task_id, start_at, end_at, duration, is_pomodoro, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.taskId,
      input.startAt,
      input.endAt ?? null,
      input.duration,
      input.isPomodoro ? 1 : 0,
      input.note ?? null
    )
  touchTask(input.taskId)
  return { id: Number(result.lastInsertRowid), taskId: input.taskId, startAt: input.startAt, endAt: input.endAt ?? null, duration: input.duration, isPomodoro: input.isPomodoro ?? false, note: input.note ?? null }
}

export function listTimeEntries(taskId: number): TimeEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT id, task_id AS taskId, start_at AS startAt, end_at AS endAt, duration,
        is_pomodoro AS isPomodoro, note FROM time_entries WHERE task_id = ? ORDER BY start_at`
    )
    .all(taskId) as Array<{
    id: number
    taskId: number
    startAt: string
    endAt: string | null
    duration: number
    isPomodoro: number
    note: string | null
  }>
  return rows.map((r) => ({ ...r, isPomodoro: r.isPomodoro === 1 }))
}

export function timeTrackedFor(taskId: number): number {
  const row = getDb()
    .prepare('SELECT COALESCE(SUM(duration), 0) AS total FROM time_entries WHERE task_id = ?')
    .get(taskId) as { total: number }
  return row.total
}

// Correct a manual entry's date, duration, or note. Pomodoro sessions are
// logged automatically and not normally edited, but the same path works for
// any entry.
export function updateTimeEntry(id: number, patch: TimeEntryPatch): void {
  const sets: string[] = []
  const vals: unknown[] = []
  if (patch.startAt !== undefined) {
    sets.push('start_at = ?')
    vals.push(patch.startAt)
  }
  if (patch.duration !== undefined) {
    sets.push('duration = ?')
    vals.push(patch.duration)
  }
  if (patch.note !== undefined) {
    sets.push('note = ?')
    vals.push(patch.note)
  }
  if (sets.length === 0) return
  const row = getDb().prepare('SELECT task_id AS taskId FROM time_entries WHERE id = ?').get(id) as
    | { taskId: number }
    | undefined
  getDb()
    .prepare(`UPDATE time_entries SET ${sets.join(', ')} WHERE id = ?`)
    .run(...vals, id)
  if (row) touchTask(row.taskId)
}

export function deleteTimeEntry(id: number): void {
  const row = getDb().prepare('SELECT task_id AS taskId FROM time_entries WHERE id = ?').get(id) as
    | { taskId: number }
    | undefined
  getDb().prepare('DELETE FROM time_entries WHERE id = ?').run(id)
  if (row) touchTask(row.taskId)
}

// The time report (Part 7): tracked minutes bucketed by (task, ISO-week),
// optionally scoped to a space and a date window. Each row carries the task's
// effective billing (its override falling back to the space default in
// spaces.preferences.billing) so the renderer can compute amounts in one pass.
// Weeks start Monday in UTC; SQLite's date(...,'-6 days','weekday 1') yields
// the Monday of the week containing each entry's start.
export function timeReport(opts: TimeReportOptions = {}): TimeReportRow[] {
  const spaceId = opts.spaceId ?? null
  const from = opts.from ?? null
  const to = opts.to ?? null
  const rows = getDb()
    .prepare(
      `SELECT
         t.id AS taskId,
         t.title AS taskTitle,
         s.id AS spaceId,
         s.name AS spaceName,
         date(te.start_at, '-6 days', 'weekday 1') AS weekStart,
         COALESCE(SUM(te.duration), 0) AS minutes,
         COALESCE(t.billing_mode, json_extract(s.preferences, '$.billing.mode'), 'none') AS billingMode,
         COALESCE(t.billing_rate, json_extract(s.preferences, '$.billing.rate')) AS billingRate,
         t.billing_units AS billingUnits
       FROM time_entries te
       JOIN tasks t ON t.id = te.task_id
       JOIN spaces s ON s.id = t.space_id
       WHERE (? IS NULL OR t.space_id = ?)
         AND (? IS NULL OR te.start_at >= ?)
         AND (? IS NULL OR te.start_at < ?)
       GROUP BY t.id, weekStart
       ORDER BY s.name, t.title, weekStart`
    )
    .all(spaceId, spaceId, from, from, to, to) as Array<{
    taskId: number
    taskTitle: string
    spaceId: number
    spaceName: string
    weekStart: string
    minutes: number
    billingMode: BillingMode
    billingRate: number | null
    billingUnits: number | null
  }>
  return rows
}

// --- Activity ---

export function listTaskActivity(taskId: number): ActivityEntry[] {
  return getDb()
    .prepare(
      `SELECT id, item_type AS itemType, item_id AS itemId, action,
        old_value AS oldValue, new_value AS newValue, created_at AS createdAt
       FROM activity_log WHERE item_type = 'task' AND item_id = ?
       ORDER BY created_at DESC, id DESC`
    )
    .all(taskId) as ActivityEntry[]
}

// --- Templates (Part 7) ---

interface TemplateContent {
  title: string
  description: string | null
  status: string | null
  priority: Task['priority']
  subtasks: string[]
  tags: string[]
  fields: Array<{ fieldId: number; value: string }>
}

// Capture a task's structure (not its activity/time) as a reusable template.
export function createTemplate(taskId: number, name: string): TaskTemplate {
  const task = getTask(taskId)
  if (!task) throw new Error(`No task with id ${taskId}`)
  const content: TemplateContent = {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    subtasks: listSubtasks(taskId).map((s) => s.title),
    tags: listTaskTags(taskId).map((t) => t.name),
    fields: listFieldValues(taskId)
      .filter((f) => f.value !== null)
      .map((f) => ({ fieldId: f.fieldId, value: f.value as string }))
  }
  const result = getDb()
    .prepare('INSERT INTO task_templates (space_id, name, content) VALUES (?, ?, ?)')
    .run(task.spaceId, name.trim(), JSON.stringify(content))
  return { id: Number(result.lastInsertRowid), spaceId: task.spaceId, name: name.trim() }
}

export function listTemplates(spaceId: number): TaskTemplate[] {
  return getDb()
    .prepare('SELECT id, space_id AS spaceId, name FROM task_templates WHERE space_id = ? ORDER BY name')
    .all(spaceId) as TaskTemplate[]
}

export function deleteTemplate(id: number): void {
  getDb().prepare('DELETE FROM task_templates WHERE id = ?').run(id)
}

// Create a fresh task pre-filled from a template's structure.
export function applyTemplate(templateId: number): Task {
  const row = getDb()
    .prepare('SELECT space_id AS spaceId, content FROM task_templates WHERE id = ?')
    .get(templateId) as { spaceId: number; content: string } | undefined
  if (!row) throw new Error(`No template with id ${templateId}`)
  const c = JSON.parse(row.content) as TemplateContent
  const task = createTask({
    spaceId: row.spaceId,
    title: c.title,
    description: c.description,
    status: c.status,
    priority: c.priority
  })
  for (const title of c.subtasks) addSubtask(task.id, title)
  for (const name of c.tags) addTag(task.id, createTag(row.spaceId, name).id)
  for (const f of c.fields) setFieldValue(task.id, f.fieldId, f.value)
  return task
}
