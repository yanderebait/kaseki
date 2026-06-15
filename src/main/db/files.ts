import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { getDb } from './connection'
import { paths } from '../paths'
import type { FileKind, FileRecord } from '../../shared/types'

interface FileRow {
  id: number
  hash: string
  original_name: string
  mime_type: string | null
  size: number
  uploaded_at: string
  sensitive: number
}

const KIND_BY_EXT: Record<string, FileKind> = {
  '.pdf': 'pdf',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.bmp': 'image',
  '.svg': 'image',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.csv': 'csv',
  '.txt': 'text',
  '.log': 'text',
  '.json': 'text',
  '.xml': 'text',
  '.yml': 'text',
  '.yaml': 'text',
  '.js': 'text',
  '.ts': 'text',
  '.py': 'text',
  '.sh': 'text',
  '.css': 'text',
  '.html': 'text'
}

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.html': 'text/html'
}

export function deriveKind(name: string): FileKind {
  return KIND_BY_EXT[extname(name).toLowerCase()] ?? 'other'
}

export function deriveMime(name: string): string {
  return MIME_BY_EXT[extname(name).toLowerCase()] ?? 'application/octet-stream'
}

function rowToRecord(row: FileRow): FileRecord {
  return {
    id: row.id,
    name: row.original_name,
    mime: row.mime_type,
    size: row.size,
    kind: deriveKind(row.original_name),
    hash: row.hash,
    uploadedAt: row.uploaded_at
  }
}

// Content-addressed storage: a file's bytes are hashed (SHA-256), stored in
// uploads/ named by hash, and recorded once. Re-ingesting identical bytes
// returns the existing record (dedup); the on-disk blob is shared.
export function ingestFile(sourcePath: string, displayName?: string): FileRecord {
  const db = getDb()
  const bytes = readFileSync(sourcePath)
  const hash = createHash('sha256').update(bytes).digest('hex')

  const existing = db.prepare('SELECT * FROM files WHERE hash = ?').get(hash) as FileRow | undefined
  if (existing) return rowToRecord(existing)

  const name = displayName ?? sourcePath.split(/[/\\]/).pop() ?? 'file'
  const blobPath = join(paths.uploads, hash)
  if (!existsSync(blobPath)) copyFileSync(sourcePath, blobPath)

  const result = db
    .prepare(
      `INSERT INTO files (hash, original_name, mime_type, size, sensitive)
       VALUES (?, ?, ?, ?, 0)`
    )
    .run(hash, name, deriveMime(name), statSync(sourcePath).size)
  return rowToRecord(db.prepare('SELECT * FROM files WHERE id = ?').get(Number(result.lastInsertRowid)) as FileRow)
}

// The All-files scope: every non-sensitive file (the sensitive folder is
// Phase 7).
export function listFiles(): FileRecord[] {
  const rows = getDb()
    .prepare('SELECT * FROM files WHERE sensitive = 0 ORDER BY uploaded_at DESC, id DESC')
    .all() as FileRow[]
  return rows.map(rowToRecord)
}

export function getFile(id: number): FileRecord | null {
  const row = getDb().prepare('SELECT * FROM files WHERE id = ?').get(id) as FileRow | undefined
  return row ? rowToRecord(row) : null
}

// Absolute path to the blob, for the kaseki-file:// protocol and printing.
// Main process only — never exposed to the renderer.
export function getFilePath(id: number): { path: string; mime: string } | null {
  const row = getDb().prepare('SELECT * FROM files WHERE id = ?').get(id) as FileRow | undefined
  if (!row) return null
  return { path: join(paths.uploads, row.hash), mime: row.mime_type ?? 'application/octet-stream' }
}
