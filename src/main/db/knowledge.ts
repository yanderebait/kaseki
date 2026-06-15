import { getDb } from './connection'
import { pmText } from '../prosemirror'
import type {
  KnowledgeContent,
  KnowledgePage,
  KnowledgePageNode,
  KnowledgeSearchHit,
  NewKnowledgePage
} from '../../shared/types'

interface PageRow {
  id: number
  parent_id: number | null
  title: string
  content: string | null
  position: number
  created_at: string
  updated_at: string
}

function parseContent(raw: string | null): KnowledgeContent | null {
  if (raw == null) return null
  try {
    return JSON.parse(raw) as KnowledgeContent
  } catch {
    return null
  }
}

function toPage(row: PageRow): KnowledgePage {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    position: row.position,
    content: parseContent(row.content),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function getPage(id: number): KnowledgePage | null {
  const row = getDb().prepare('SELECT * FROM knowledge_pages WHERE id = ?').get(id) as
    | PageRow
    | undefined
  return row ? toPage(row) : null
}

// The whole tree as a flat, ordered list (id/parent/title/position only —
// no content, the sidebar doesn't need it). The renderer nests by parentId.
export function listTree(): KnowledgePageNode[] {
  const rows = getDb()
    .prepare('SELECT id, parent_id, title, position FROM knowledge_pages ORDER BY position')
    .all() as Pick<PageRow, 'id' | 'parent_id' | 'title' | 'position'>[]
  return rows.map((r) => ({ id: r.id, parentId: r.parent_id, title: r.title, position: r.position }))
}

export function createPage(input: NewKnowledgePage): KnowledgePage {
  const db = getDb()
  const parentId = input.parentId ?? null
  const { n } = db
    .prepare('SELECT count(*) AS n FROM knowledge_pages WHERE parent_id IS ?')
    .get(parentId) as { n: number }
  const result = db
    .prepare('INSERT INTO knowledge_pages (parent_id, title, content, position) VALUES (?, ?, ?, ?)')
    .run(parentId, input.title, input.content != null ? JSON.stringify(input.content) : null, n)
  return getPage(Number(result.lastInsertRowid))!
}

export function updatePage(
  id: number,
  patch: { title?: string; content?: KnowledgeContent | null }
): void {
  const sets: string[] = []
  const vals: unknown[] = []
  if (patch.title !== undefined) {
    sets.push('title = ?')
    vals.push(patch.title)
  }
  if (patch.content !== undefined) {
    sets.push('content = ?')
    vals.push(patch.content != null ? JSON.stringify(patch.content) : null)
  }
  if (sets.length === 0) return
  sets.push('updated_at = CURRENT_TIMESTAMP')
  vals.push(id)
  getDb()
    .prepare(`UPDATE knowledge_pages SET ${sets.join(', ')} WHERE id = ?`)
    .run(...vals)
}

// Deletes a page and its whole subtree, children before parents so the
// self-referential parent_id foreign key is never violated, dropping any
// cross-links that pointed at (or from) each deleted page along the way.
function deleteSubtree(id: number): void {
  const db = getDb()
  const kids = db.prepare('SELECT id FROM knowledge_pages WHERE parent_id = ?').all(id) as {
    id: number
  }[]
  for (const k of kids) deleteSubtree(k.id)
  db.prepare(
    'DELETE FROM links WHERE (source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?)'
  ).run('knowledge', id, 'knowledge', id)
  db.prepare('DELETE FROM knowledge_pages WHERE id = ?').run(id)
}

export function deletePage(id: number): void {
  getDb().transaction(() => deleteSubtree(id))()
}

function descendantIds(id: number): Set<number> {
  const db = getDb()
  const out = new Set<number>()
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    const kids = db.prepare('SELECT id FROM knowledge_pages WHERE parent_id = ?').all(cur) as {
      id: number
    }[]
    for (const k of kids) {
      if (!out.has(k.id)) {
        out.add(k.id)
        stack.push(k.id)
      }
    }
  }
  return out
}

// Swaps a page with its previous (-1) or next (+1) sibling.
export function reorderPage(id: number, dir: -1 | 1): void {
  const db = getDb()
  const page = db
    .prepare('SELECT id, parent_id, position FROM knowledge_pages WHERE id = ?')
    .get(id) as { id: number; parent_id: number | null; position: number } | undefined
  if (!page) return
  const siblings = db
    .prepare('SELECT id, position FROM knowledge_pages WHERE parent_id IS ? ORDER BY position')
    .all(page.parent_id) as { id: number; position: number }[]
  const idx = siblings.findIndex((s) => s.id === id)
  const target = idx + dir
  if (target < 0 || target >= siblings.length) return
  const other = siblings[target]
  db.transaction(() => {
    db.prepare('UPDATE knowledge_pages SET position = ? WHERE id = ?').run(other.position, id)
    db.prepare('UPDATE knowledge_pages SET position = ? WHERE id = ?').run(page.position, other.id)
  })()
}

// Reparents a page (appended at the end of the new parent's children).
// Refuses to create a cycle — a page can't move under itself or a
// descendant. newParentId null moves it to the top level. Returns whether
// the move was applied.
export function movePage(id: number, newParentId: number | null): boolean {
  const db = getDb()
  if (!db.prepare('SELECT id FROM knowledge_pages WHERE id = ?').get(id)) return false
  if (newParentId !== null) {
    if (newParentId === id) return false
    if (descendantIds(id).has(newParentId)) return false
    if (!db.prepare('SELECT id FROM knowledge_pages WHERE id = ?').get(newParentId)) return false
  }
  const { n } = db
    .prepare('SELECT count(*) AS n FROM knowledge_pages WHERE parent_id IS ?')
    .get(newParentId) as { n: number }
  db.prepare('UPDATE knowledge_pages SET parent_id = ?, position = ? WHERE id = ?').run(
    newParentId,
    n,
    id
  )
  return true
}

function makeSnippet(body: string, q: string): string {
  if (!body) return ''
  const idx = body.toLowerCase().indexOf(q)
  if (idx === -1) return body.slice(0, 120).trim()
  const start = Math.max(0, idx - 40)
  const end = Math.min(body.length, idx + q.length + 80)
  return (start > 0 ? '…' : '') + body.slice(start, end).trim() + (end < body.length ? '…' : '')
}

// Full-text search across page titles and (flattened) bodies. Single-user
// wikis are small, so parsing each page's JSON in process is plenty fast and
// avoids matching the JSON's structural keys the way a raw LIKE would.
export function searchPages(query: string): KnowledgeSearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const rows = getDb().prepare('SELECT id, title, content FROM knowledge_pages').all() as {
    id: number
    title: string
    content: string | null
  }[]
  const hits: KnowledgeSearchHit[] = []
  for (const r of rows) {
    const body = r.content ? pmText(parseContent(r.content)) : ''
    if (!`${r.title}\n${body}`.toLowerCase().includes(q)) continue
    hits.push({ id: r.id, title: r.title, snippet: makeSnippet(body, q) })
  }
  return hits
}
