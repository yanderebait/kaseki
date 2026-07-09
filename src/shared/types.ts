// The IPC contract shared by the main, preload, and renderer processes.
// Main's db modules return objects structurally matching these; preload
// re-exposes them across the contextBridge; the renderer consumes them.

export interface User {
  name: string
}

export type Preferences = Record<string, unknown>

export type FieldType =
  | 'text'
  | 'multiline'
  | 'number'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'file'
  | 'url'

export const FIELD_TYPES: FieldType[] = [
  'text',
  'multiline',
  'number',
  'date',
  'datetime',
  'select',
  'multiselect',
  'checkbox',
  'file',
  'url'
]

export interface FieldDef {
  name: string
  type: FieldType
  options?: string[] // for select / multiselect
}

export interface Space {
  id: number
  name: string
  accentColor: string | null
  icon: string | null
  position: number
  activeTaskCount: number
}

export interface NewSpace {
  name: string
  accentColor?: string | null
  icon?: string | null
  presetId?: string | null
  fields?: FieldDef[]
  statusSet?: string[]
  cheatsheet?: string
}

// A partial edit to an existing space (v0.2.0 — spaces were previously
// immutable after creation). Absent fields are left untouched. statusSet is
// sanitised on write: 'Done' is always kept, since completion logic keys on it.
export interface SpaceEdit {
  name?: string
  accentColor?: string | null
  icon?: string | null
  cheatsheet?: string
  statusSet?: string[]
}

// The three billing patterns (Part 7), plus 'none' for spaces that don't bill
// (Personal and the long tail of presets). A space carries a default; a task
// may override it.
export type BillingMode = 'time' | 'job' | 'unit' | 'none'

// A space's default billing pattern, stored in spaces.preferences.billing. The
// rate is the hourly rate (time), fixed price (job), or per-unit value (unit);
// null until the user sets one.
export interface SpaceBilling {
  mode: BillingMode
  rate: number | null
}

// The full per-space configuration the dashboard shell reads.
export interface SpaceDetail extends Space {
  presetId: string | null
  fields: FieldDef[]
  statusSet: string[]
  cheatsheet: string
  billing: SpaceBilling
}

// Tasks (Part 7). The only required field is the title.
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Critical'

export interface Task {
  id: number
  spaceId: number
  title: string
  description: string | null
  status: string | null
  priority: TaskPriority | null
  pinned: boolean
  archived: boolean
  dueDate: string | null
  estimatedTime: number | null // minutes
  // Per-task billing override (Part 7). billingMode null = inherit the space
  // default; billingRate is £/hr (time), fixed price (job), or per-unit value
  // (unit); billingUnits is the count for unit-based billing.
  billingMode: BillingMode | null
  billingRate: number | null
  billingUnits: number | null
  // Set when the task entered 'Done', cleared if it leaves. Fixed-price and
  // per-unit billing counts in the month of this timestamp.
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Tag {
  id: number
  name: string
  color: string | null
}

export interface Subtask {
  id: number
  title: string
  completed: boolean
  position: number
}

// A custom field value on a task: the space's field definition plus the value.
export interface TaskFieldValue {
  fieldId: number
  name: string
  type: FieldType
  options?: string[]
  value: string | null
}

// A row in the dashboard task list (Part 6).
export interface TaskSummary extends Task {
  tags: Tag[]
  subtaskCount: number
  subtaskDone: number
  stale: boolean
  staleDays: number
  blocked: boolean // has an unfinished upstream dependency (wired in commit B)
}

// The full task for the detail slide-out (Part 8).
export interface TaskDetail extends Task {
  tags: Tag[]
  subtasks: Subtask[]
  fields: TaskFieldValue[]
  timeTracked: number // minutes, summed from time_entries
  timeEntries: TimeEntry[] // the individual entries, for the Time tab
  blockers: Task[] // upstream — what this task is waiting on
  blocking: Task[] // downstream — what this task blocks
  files: FileRecord[]
  note: KnowledgeContent | null // single long-form rich-text note
  activity: ActivityEntry[]
}

export interface NewTimeEntry {
  taskId: number
  startAt: string
  endAt?: string | null
  duration: number // minutes
  isPomodoro?: boolean
  note?: string | null
}

export interface TimeEntry {
  id: number
  taskId: number
  startAt: string
  endAt: string | null
  duration: number
  isPomodoro: boolean
  note: string | null
}

// A manual edit to an existing time entry (the timer logs are immutable in
// spirit, but the user can correct a manual entry's date, duration, or note).
export interface TimeEntryPatch {
  startAt?: string
  duration?: number
  note?: string | null
}

// Options for the time report (Part 7): a space (null = all spaces) and an
// inclusive-from / exclusive-to ISO window.
export interface TimeReportOptions {
  spaceId?: number | null
  from?: string | null
  to?: string | null
}

// One (task, ISO-week) bucket of tracked time, carrying the task's effective
// billing (its own override falling back to the space default) so the report
// builder can compute amounts without a second lookup.
export interface TimeReportRow {
  taskId: number
  taskTitle: string
  spaceId: number
  spaceName: string
  // 'YYYY-MM-DD', the Monday (UTC) of the week — or null for a billable task
  // with no tracked time in the requested window (fixed-price / per-unit
  // tasks appear in the report regardless of tracked time).
  weekStart: string | null
  minutes: number
  billingMode: BillingMode
  billingRate: number | null
  billingUnits: number | null
  completedAt: string | null
}

export interface TaskTemplate {
  id: number
  spaceId: number
  name: string
}

// The result of attempting to add a dependency (refused on a cycle).
export interface DependencyResult {
  ok: boolean
  error?: string
}

export interface NewTask {
  spaceId: number
  title: string
  description?: string | null
  status?: string | null
  priority?: TaskPriority | null
  dueDate?: string | null
  estimatedTime?: number | null
}

export interface TaskPatch {
  title?: string
  description?: string | null
  status?: string | null
  priority?: TaskPriority | null
  pinned?: boolean
  archived?: boolean
  dueDate?: string | null
  estimatedTime?: number | null
  billingMode?: BillingMode | null
  billingRate?: number | null
  billingUnits?: number | null
}

export interface ActivityEntry {
  id: number
  itemType: string
  itemId: number
  action: string
  oldValue?: string | null
  newValue?: string | null
  createdAt: string
  // Context resolved at read time so the feed can say what happened to what,
  // and route a click to it (null title = the item has since been deleted).
  title?: string | null
  spaceId?: number | null
  spaceName?: string | null
  accent?: string | null
}

// Renderer-facing launcher item. The actual path/URL stays in the main
// process (the renderer launches by id); the icon is inlined as a data URL
// so the sandboxed renderer can render it without filesystem access.
export interface LauncherItem {
  id: number
  name: string
  kind: 'url' | 'app'
  available: boolean
  iconDataUrl: string | null
}

// How the document viewer should render a file. The renderer never sees the
// path — it fetches bytes via kaseki-file://<id>.
export type FileKind = 'pdf' | 'image' | 'text' | 'markdown' | 'csv' | 'other'

export interface FileRecord {
  id: number
  name: string
  mime: string | null
  size: number
  kind: FileKind
  hash: string
  uploadedAt: string
}

// Overlay metadata stored alongside a file — never modifying it. Bookmarks,
// highlights, and sticky notes all live in document_annotations, told apart
// by type. position holds a rect (highlight) or point (note); bookmarks use
// only page + content (label).
export type AnnotationType = 'bookmark' | 'highlight' | 'note'

export interface Annotation {
  id: number
  fileId: number
  page: number
  type: AnnotationType
  position: Record<string, number> | null
  content: string | null
  color: string | null
  createdAt: string
}

export interface NewAnnotation {
  fileId: number
  page: number
  type: AnnotationType
  position?: Record<string, number> | null
  content?: string | null
  color?: string | null
}

// An ordered collection of file references (Part 9) — the bundle stores the
// order, not copies of the files.
export interface Bundle {
  id: number
  name: string
  fileCount: number
}

export interface BundleDetail {
  id: number
  name: string
  files: FileRecord[]
}

// A calendar event master — a one-off or the head of a recurring series
// (recurrenceRule is an iCalendar RRULE string). spaceId null = Global.
// Times are UTC ISO strings.
export interface CalendarEvent {
  id: number
  spaceId: number | null
  title: string
  description: string | null
  start: string
  end: string | null
  allDay: boolean
  location: string | null
  recurrenceRule: string | null
  completed: boolean
  // IANA timezone the event recurs in (v0.2.0). Recurrence fires at the same
  // wall-clock time in this zone, so a weekly 14:00 stays 14:00 across DST.
  tz: string
}

export interface NewEvent {
  spaceId?: number | null
  title: string
  description?: string | null
  start: string
  end?: string | null
  allDay?: boolean
  location?: string | null
  recurrenceRule?: string | null
  // Omitted → the machine's current zone.
  tz?: string
}

// One concrete occurrence (after expanding recurrence and applying
// overrides/exceptions). originalStart is the series slot — the key for
// per-occurrence edits; occurrenceStart is where it actually lands.
export interface EventOccurrence {
  masterId: number
  occurrenceStart: string
  originalStart: string
  overrideId: number | null
  recurring: boolean
  title: string
  description: string | null
  end: string | null
  allDay: boolean
  location: string | null
  spaceId: number | null
  accent: string | null
  completed: boolean
}

// A knowledge area page (Part 10). content is the Tiptap/ProseMirror JSON
// document; null for an empty page. parentId null = a top-level page.
export type KnowledgeContent = Record<string, unknown>

// The lightweight shape the sidebar tree needs (no content body).
export interface KnowledgePageNode {
  id: number
  parentId: number | null
  title: string
  position: number
}

export interface KnowledgePage extends KnowledgePageNode {
  content: KnowledgeContent | null
  createdAt: string
  updatedAt: string
}

export interface NewKnowledgePage {
  title: string
  parentId?: number | null
  content?: KnowledgeContent | null
}

export interface KnowledgeSearchHit {
  id: number
  title: string
  snippet: string
}

// Global search (Part 15). One result, tagged with its kind so the palette can
// group results and route a click to the right surface.
export type SearchHitType =
  | 'task'
  | 'subtask'
  | 'event'
  | 'knowledge'
  | 'file'
  | 'space'
  | 'bundle'
  | 'vault'

export interface SearchHit {
  type: SearchHitType
  id: number // the matched item's id (the routing target, except subtasks — see parentId)
  title: string
  snippet: string | null // a short excerpt around the match, when the body matched
  spaceId: number | null // owning space, for accent colouring and navigation (null = global/none)
  spaceName: string | null
  accentColor: string | null
  parentId?: number // for a subtask, its parent task id (what a click opens)
}

// The sensitive folder (Part 11). 'absent' = no vault created yet, 'locked' =
// exists but the passcode hasn't been entered this session, 'unlocked' = the
// DEK is in memory. Names/MIME are decrypted by the main process before they
// reach the renderer; the renderer never sees ciphertext, paths, or keys.
export type VaultStatus = 'absent' | 'locked' | 'unlocked'

export interface VaultFile {
  id: number
  name: string
  mime: string
  size: number
  kind: FileKind
  createdAt: string
}

// Cross-linking (Part 10). The graph is generic over item types; today the
// linkable ones are knowledge pages, calendar events, and files.
export type LinkItemType = 'knowledge' | 'event' | 'file'

// One endpoint of a link, with a display label resolved by the main process.
export interface LinkRef {
  type: LinkItemType
  id: number
  label: string
}

// A link as seen from one item: linkId identifies the row, ref is the far
// endpoint (the target for outgoing links, the source for backlinks).
export interface LinkEdge {
  linkId: number
  ref: LinkRef
}

// Everything the link picker can offer, grouped by type.
export interface LinkCandidates {
  knowledge: LinkRef[]
  event: LinkRef[]
  file: LinkRef[]
}
