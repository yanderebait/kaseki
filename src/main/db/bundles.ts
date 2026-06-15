import { getDb } from './connection'
import { getFile } from './files'
import type { Bundle, BundleDetail, FileRecord } from '../../shared/types'

export function listBundles(): Bundle[] {
  return getDb()
    .prepare(
      `SELECT b.id, b.name,
        (SELECT count(*) FROM bundle_files bf WHERE bf.bundle_id = b.id) AS fileCount
       FROM bundles b ORDER BY b.created_at DESC, b.id DESC`
    )
    .all() as Bundle[]
}

export function createBundle(name: string): Bundle {
  const result = getDb().prepare('INSERT INTO bundles (name) VALUES (?)').run(name)
  return { id: Number(result.lastInsertRowid), name, fileCount: 0 }
}

export function renameBundle(id: number, name: string): void {
  getDb().prepare('UPDATE bundles SET name = ? WHERE id = ?').run(name, id)
}

export function deleteBundle(id: number): void {
  getDb()
    .transaction(() => {
      getDb().prepare('DELETE FROM bundle_files WHERE bundle_id = ?').run(id)
      getDb().prepare('DELETE FROM bundles WHERE id = ?').run(id)
    })()
}

// The bundle's files in order. Skips any file rows that no longer exist.
export function getBundle(id: number): BundleDetail | null {
  const bundle = getDb().prepare('SELECT id, name FROM bundles WHERE id = ?').get(id) as
    | { id: number; name: string }
    | undefined
  if (!bundle) return null
  const ids = getDb()
    .prepare('SELECT file_id FROM bundle_files WHERE bundle_id = ? ORDER BY position')
    .all(id) as { file_id: number }[]
  const files = ids.map((r) => getFile(r.file_id)).filter((f): f is FileRecord => f !== null)
  return { id: bundle.id, name: bundle.name, files }
}

// Appends a file unless it is already in the bundle (it stores references,
// not copies).
export function addFileToBundle(bundleId: number, fileId: number): void {
  const db = getDb()
  const exists = db
    .prepare('SELECT 1 FROM bundle_files WHERE bundle_id = ? AND file_id = ?')
    .get(bundleId, fileId)
  if (exists) return
  const { pos } = db
    .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM bundle_files WHERE bundle_id = ?')
    .get(bundleId) as { pos: number }
  db.prepare('INSERT INTO bundle_files (bundle_id, file_id, position) VALUES (?, ?, ?)').run(
    bundleId,
    fileId,
    pos
  )
}

export function removeFileFromBundle(bundleId: number, fileId: number): void {
  getDb()
    .prepare('DELETE FROM bundle_files WHERE bundle_id = ? AND file_id = ?')
    .run(bundleId, fileId)
}

// Swaps a file with its neighbour in the bundle order.
export function moveBundleFile(bundleId: number, fileId: number, dir: -1 | 1): void {
  const db = getDb()
  const item = db
    .prepare('SELECT file_id, position FROM bundle_files WHERE bundle_id = ? AND file_id = ?')
    .get(bundleId, fileId) as { file_id: number; position: number } | undefined
  if (!item) return
  const neighbour = db
    .prepare(
      `SELECT file_id, position FROM bundle_files
       WHERE bundle_id = ? AND position ${dir < 0 ? '<' : '>'} ?
       ORDER BY position ${dir < 0 ? 'DESC' : 'ASC'} LIMIT 1`
    )
    .get(bundleId, item.position) as { file_id: number; position: number } | undefined
  if (!neighbour) return
  db.transaction(() => {
    db.prepare('UPDATE bundle_files SET position = ? WHERE bundle_id = ? AND file_id = ?').run(
      neighbour.position,
      bundleId,
      item.file_id
    )
    db.prepare('UPDATE bundle_files SET position = ? WHERE bundle_id = ? AND file_id = ?').run(
      item.position,
      bundleId,
      neighbour.file_id
    )
  })()
}
