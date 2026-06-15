import { getDb } from './connection'
import { pmText } from '../prosemirror'
import { searchPages } from './knowledge'
import type { SearchHit, VaultFile } from '../../shared/types'

// Global search (Part 15): one LIKE-based pass per content type, scored by a
// simple relevance heuristic (title match beats body match; prefix beats
// mid-word) and grouped/capped per type. No FTS index — substring matching is
// enough for a single-user local store and matches the existing in-area search.
// Vault files are searched only when unlocked; the caller passes the decrypted
// list (this module never touches the DEK). File search is filename-only — the
// schema has no file tags, and reading text-file content on every keystroke
// would fight the latency budget (both deferred, noted in the spec).

const MAX_PER_TYPE = 8
const MIN_QUERY = 2

function escapeLike(q: string): string {
  return q.replace(/[%_\\]/g, '\\$&')
}

// Where a query matched within a piece of text: exact > prefix > word-start >
// mid-word; 0 if absent.
function scoreText(text: string, q: string): number {
  const t = text.toLowerCase()
  const i = t.indexOf(q)
  if (i < 0) return 0
  if (t === q) return 100
  if (i === 0) return 80
  return /\W/.test(t[i - 1] ?? '') ? 65 : 50
}

const BODY_SCORE = 30

// A ~one-line excerpt around the first match, with ellipses where trimmed.
function snippet(text: string | null | undefined, q: string): string | null {
  if (!text) return null
  const t = text.replace(/\s+/g, ' ').trim()
  const i = t.toLowerCase().indexOf(q)
  if (i < 0) return null
  const start = Math.max(0, i - 30)
  const end = Math.min(t.length, i + q.length + 50)
  return `${start > 0 ? '…' : ''}${t.slice(start, end)}${end < t.length ? '…' : ''}`
}

interface TaskDisplay {
  id: number
  title: string
  description?: string | null
  spaceId: number
  spaceName: string
  accentColor: string | null
}

export function globalSearch(query: string, vaultFiles: VaultFile[] = []): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (q.length < MIN_QUERY) return []
  const like = `%${escapeLike(q)}%`
  const d = getDb()
  const scored: { hit: SearchHit; score: number }[] = []
  const push = (score: number, hit: SearchHit): void => {
    scored.push({ hit, score })
  }

  // --- Tasks: title / description / custom fields (SQL), then notes (parsed) ---
  const seenTask = new Set<number>()
  const addTask = (r: TaskDisplay, snip: string | null): void => {
    if (seenTask.has(r.id)) return
    seenTask.add(r.id)
    push(Math.max(scoreText(r.title, q), BODY_SCORE), {
      type: 'task',
      id: r.id,
      title: r.title,
      snippet: snip,
      spaceId: r.spaceId,
      spaceName: r.spaceName,
      accentColor: r.accentColor
    })
  }
  const taskRows = d
    .prepare(
      `SELECT t.id, t.title, t.description, t.space_id AS spaceId, s.name AS spaceName,
        s.accent_color AS accentColor
       FROM tasks t JOIN spaces s ON s.id = t.space_id
       WHERE t.archived = 0 AND (
         t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\'
         OR EXISTS (SELECT 1 FROM custom_field_values v WHERE v.task_id = t.id AND v.value LIKE ? ESCAPE '\\')
       )`
    )
    .all(like, like, like) as TaskDisplay[]
  for (const r of taskRows) addTask(r, snippet(r.description, q))

  // Notes are JSON Tiptap docs — parse to text so we match content, not the
  // document's structural keys ("paragraph", "text", …).
  const noteRows = d
    .prepare(
      `SELECT t.id, t.title, t.space_id AS spaceId, s.name AS spaceName, s.accent_color AS accentColor,
        n.content
       FROM task_notes n JOIN tasks t ON t.id = n.task_id JOIN spaces s ON s.id = t.space_id
       WHERE t.archived = 0 AND n.content IS NOT NULL`
    )
    .all() as Array<TaskDisplay & { content: string }>
  for (const r of noteRows) {
    if (seenTask.has(r.id)) continue
    let body = ''
    try {
      body = pmText(JSON.parse(r.content))
    } catch {
      body = ''
    }
    if (!body.toLowerCase().includes(q)) continue
    addTask(r, snippet(body, q))
  }

  // --- Subtasks (route to the parent task) ---
  const subRows = d
    .prepare(
      `SELECT st.id, st.title, t.id AS taskId, t.space_id AS spaceId, s.name AS spaceName,
        s.accent_color AS accentColor
       FROM subtasks st JOIN tasks t ON t.id = st.task_id JOIN spaces s ON s.id = t.space_id
       WHERE t.archived = 0 AND st.title LIKE ? ESCAPE '\\'`
    )
    .all(like) as Array<{
    id: number
    title: string
    taskId: number
    spaceId: number
    spaceName: string
    accentColor: string | null
  }>
  for (const r of subRows) {
    push(scoreText(r.title, q), {
      type: 'subtask',
      id: r.id,
      title: r.title,
      snippet: null,
      spaceId: r.spaceId,
      spaceName: r.spaceName,
      accentColor: r.accentColor,
      parentId: r.taskId
    })
  }

  // --- Events (master/standalone rows only, so overrides don't double up) ---
  const evRows = d
    .prepare(
      `SELECT e.id, e.title, e.description, e.location, e.space_id AS spaceId, s.name AS spaceName,
        s.accent_color AS accentColor
       FROM events e LEFT JOIN spaces s ON s.id = e.space_id
       WHERE e.recurrence_parent_id IS NULL AND (
         e.title LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\' OR e.location LIKE ? ESCAPE '\\'
       )`
    )
    .all(like, like, like) as Array<{
    id: number
    title: string
    description: string | null
    location: string | null
    spaceId: number | null
    spaceName: string | null
    accentColor: string | null
  }>
  for (const r of evRows) {
    const titleScore = scoreText(r.title, q)
    push(titleScore || BODY_SCORE, {
      type: 'event',
      id: r.id,
      title: r.title,
      snippet: snippet(r.description, q) ?? snippet(r.location, q),
      spaceId: r.spaceId,
      spaceName: r.spaceName,
      accentColor: r.accentColor
    })
  }

  // --- Knowledge pages (reuse the parsed, snippeted page search) ---
  for (const h of searchPages(query)) {
    push(Math.max(scoreText(h.title, q), BODY_SCORE), {
      type: 'knowledge',
      id: h.id,
      title: h.title,
      snippet: h.snippet || null,
      spaceId: null,
      spaceName: null,
      accentColor: null
    })
  }

  // --- Files (filename only; sensitive blobs live in the vault) ---
  const fileRows = d
    .prepare(`SELECT id, original_name AS name FROM files WHERE sensitive = 0 AND original_name LIKE ? ESCAPE '\\'`)
    .all(like) as Array<{ id: number; name: string }>
  for (const r of fileRows) {
    push(scoreText(r.name, q), {
      type: 'file',
      id: r.id,
      title: r.name,
      snippet: null,
      spaceId: null,
      spaceName: null,
      accentColor: null
    })
  }

  // --- Space names ---
  const spaceRows = d
    .prepare(`SELECT id, name, accent_color AS accentColor FROM spaces WHERE archived = 0 AND name LIKE ? ESCAPE '\\'`)
    .all(like) as Array<{ id: number; name: string; accentColor: string | null }>
  for (const r of spaceRows) {
    push(scoreText(r.name, q), {
      type: 'space',
      id: r.id,
      title: r.name,
      snippet: null,
      spaceId: r.id,
      spaceName: r.name,
      accentColor: r.accentColor
    })
  }

  // --- Bundles ---
  const bundleRows = d
    .prepare(
      `SELECT b.id, b.name, b.space_id AS spaceId, s.name AS spaceName, s.accent_color AS accentColor
       FROM bundles b LEFT JOIN spaces s ON s.id = b.space_id
       WHERE b.name LIKE ? ESCAPE '\\'`
    )
    .all(like) as Array<{
    id: number
    name: string
    spaceId: number | null
    spaceName: string | null
    accentColor: string | null
  }>
  for (const r of bundleRows) {
    push(scoreText(r.name, q), {
      type: 'bundle',
      id: r.id,
      title: r.name,
      snippet: null,
      spaceId: r.spaceId,
      spaceName: r.spaceName,
      accentColor: r.accentColor
    })
  }

  // --- Vault files (unlocked only; the caller passes the decrypted list) ---
  for (const f of vaultFiles) {
    const s = scoreText(f.name, q)
    if (s > 0) {
      push(s, {
        type: 'vault',
        id: f.id,
        title: f.name,
        snippet: null,
        spaceId: null,
        spaceName: null,
        accentColor: null
      })
    }
  }

  // Highest relevance first; cap each type so no one kind floods the palette.
  scored.sort((a, b) => b.score - a.score || a.hit.title.localeCompare(b.hit.title))
  const perType = new Map<string, number>()
  const out: SearchHit[] = []
  for (const { hit } of scored) {
    const n = perType.get(hit.type) ?? 0
    if (n >= MAX_PER_TYPE) continue
    perType.set(hit.type, n + 1)
    out.push(hit)
  }
  return out
}
