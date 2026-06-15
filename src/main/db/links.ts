import { getDb } from './connection'
import type { LinkCandidates, LinkEdge, LinkItemType } from '../../shared/types'

// The cross-link graph (Part 10). A single row records a directed link from a
// source item to a target; links are read bidirectionally — the target sees
// the source as a backlink. Only the item types that exist today are
// linkable (knowledge pages, calendar events, files); tasks and notes join
// the same generic table when that system lands.
const TYPES: LinkItemType[] = ['knowledge', 'event', 'file']

interface LinkRow {
  id: number
  source_type: string
  source_id: number
  target_type: string
  target_id: number
}

function resolveLabel(type: LinkItemType, id: number): string {
  const db = getDb()
  if (type === 'knowledge') {
    const r = db.prepare('SELECT title FROM knowledge_pages WHERE id = ?').get(id) as
      | { title: string }
      | undefined
    return r?.title ?? '(deleted page)'
  }
  if (type === 'event') {
    const r = db.prepare('SELECT title FROM events WHERE id = ?').get(id) as
      | { title: string }
      | undefined
    return r?.title ?? '(deleted event)'
  }
  const r = db.prepare('SELECT original_name FROM files WHERE id = ?').get(id) as
    | { original_name: string }
    | undefined
  return r?.original_name ?? '(deleted file)'
}

export function createLink(
  sourceType: LinkItemType,
  sourceId: number,
  targetType: LinkItemType,
  targetId: number
): LinkEdge {
  if (!TYPES.includes(sourceType) || !TYPES.includes(targetType)) {
    throw new Error('invalid link type')
  }
  if (sourceType === targetType && sourceId === targetId) {
    throw new Error('cannot link an item to itself')
  }
  const db = getDb()
  const existing = db
    .prepare(
      'SELECT id FROM links WHERE source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?'
    )
    .get(sourceType, sourceId, targetType, targetId) as { id: number } | undefined
  const linkId =
    existing?.id ??
    Number(
      db
        .prepare(
          'INSERT INTO links (source_type, source_id, target_type, target_id) VALUES (?, ?, ?, ?)'
        )
        .run(sourceType, sourceId, targetType, targetId).lastInsertRowid
    )
  return { linkId, ref: { type: targetType, id: targetId, label: resolveLabel(targetType, targetId) } }
}

export function deleteLink(linkId: number): void {
  getDb().prepare('DELETE FROM links WHERE id = ?').run(linkId)
}

// Links this item makes (its "Linked items"), resolved to the far endpoint.
export function listOutgoing(type: LinkItemType, id: number): LinkEdge[] {
  const rows = getDb()
    .prepare('SELECT * FROM links WHERE source_type = ? AND source_id = ? ORDER BY id')
    .all(type, id) as LinkRow[]
  return rows.map((r) => ({
    linkId: r.id,
    ref: {
      type: r.target_type as LinkItemType,
      id: r.target_id,
      label: resolveLabel(r.target_type as LinkItemType, r.target_id)
    }
  }))
}

// Items that link to this one (its "Linked from" backlinks panel).
export function listBacklinks(type: LinkItemType, id: number): LinkEdge[] {
  const rows = getDb()
    .prepare('SELECT * FROM links WHERE target_type = ? AND target_id = ? ORDER BY id')
    .all(type, id) as LinkRow[]
  return rows.map((r) => ({
    linkId: r.id,
    ref: {
      type: r.source_type as LinkItemType,
      id: r.source_id,
      label: resolveLabel(r.source_type as LinkItemType, r.source_id)
    }
  }))
}

// Everything the link picker can offer, grouped by type. Events list only
// masters/one-offs (a series has one linkable identity).
export function linkCandidates(): LinkCandidates {
  const db = getDb()
  const knowledge = (
    db.prepare('SELECT id, title FROM knowledge_pages ORDER BY title').all() as {
      id: number
      title: string
    }[]
  ).map((r) => ({ type: 'knowledge' as const, id: r.id, label: r.title }))
  const event = (
    db
      .prepare('SELECT id, title FROM events WHERE recurrence_parent_id IS NULL ORDER BY title')
      .all() as { id: number; title: string }[]
  ).map((r) => ({ type: 'event' as const, id: r.id, label: r.title }))
  const file = (
    db.prepare('SELECT id, original_name FROM files ORDER BY original_name').all() as {
      id: number
      original_name: string
    }[]
  ).map((r) => ({ type: 'file' as const, id: r.id, label: r.original_name }))
  return { knowledge, event, file }
}
