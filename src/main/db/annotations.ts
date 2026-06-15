import { getDb } from './connection'
import type { Annotation, AnnotationType, NewAnnotation } from '../../shared/types'

interface AnnotationRow {
  id: number
  file_id: number
  page: number
  type: string
  position: string | null
  content: string | null
  color: string | null
  created_at: string
}

function toAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    fileId: row.file_id,
    page: row.page,
    type: row.type as AnnotationType,
    position: row.position ? (JSON.parse(row.position) as Record<string, number>) : null,
    content: row.content,
    color: row.color,
    createdAt: row.created_at
  }
}

export function listAnnotations(fileId: number): Annotation[] {
  const rows = getDb()
    .prepare('SELECT * FROM document_annotations WHERE file_id = ? ORDER BY page, created_at, id')
    .all(fileId) as AnnotationRow[]
  return rows.map(toAnnotation)
}

export function createAnnotation(input: NewAnnotation): Annotation {
  const result = getDb()
    .prepare(
      `INSERT INTO document_annotations (file_id, page, type, position, content, color)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.fileId,
      input.page,
      input.type,
      input.position ? JSON.stringify(input.position) : null,
      input.content ?? null,
      input.color ?? null
    )
  const row = getDb()
    .prepare('SELECT * FROM document_annotations WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as AnnotationRow
  return toAnnotation(row)
}

export function updateAnnotation(id: number, patch: { content?: string; color?: string }): void {
  if (patch.content !== undefined) {
    getDb().prepare('UPDATE document_annotations SET content = ? WHERE id = ?').run(patch.content, id)
  }
  if (patch.color !== undefined) {
    getDb().prepare('UPDATE document_annotations SET color = ? WHERE id = ?').run(patch.color, id)
  }
}

export function deleteAnnotation(id: number): void {
  getDb().prepare('DELETE FROM document_annotations WHERE id = ?').run(id)
}
