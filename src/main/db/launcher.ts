import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDb } from './connection'
import { paths } from '../paths'
import type { LauncherItem } from '../../shared/types'

interface LauncherRow {
  id: number
  space_id: number
  name: string
  path_or_url: string
  icon: string | null
  position: number
  kind: 'url' | 'app'
  platform: string | null
}

// Prefixes https:// when the user omits a scheme, and rejects anything that
// is not plain http(s) — the launcher previously accepted any scheme
// (file://, smb://, …) and handed it verbatim to shell.openExternal. Kept
// exported for the self-test.
export function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  if (!/^https?:\/\//i.test(withScheme)) {
    throw new Error('Only http:// and https:// links can be added to the launcher')
  }
  return withScheme
}

// A URL is always launchable; an app is only available on the platform it
// was set on, and only while its path still exists.
function isAvailable(row: LauncherRow): boolean {
  if (row.kind === 'url') return true
  return row.platform === process.platform && existsSync(row.path_or_url)
}

// Inlines a stored icon file (icons/) as a data URL, or null to let the
// renderer fall back to a default-by-kind glyph.
function iconDataUrl(icon: string | null): string | null {
  if (!icon) return null
  try {
    const bytes = readFileSync(join(paths.icons, icon))
    return `data:image/png;base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

function toItem(row: LauncherRow): LauncherItem {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    available: isAvailable(row),
    iconDataUrl: iconDataUrl(row.icon)
  }
}

function rowById(id: number): LauncherRow | undefined {
  return getDb().prepare('SELECT * FROM launcher_items WHERE id = ?').get(id) as
    | LauncherRow
    | undefined
}

export function listLauncherItems(spaceId: number): LauncherItem[] {
  const rows = getDb()
    .prepare('SELECT * FROM launcher_items WHERE space_id = ? ORDER BY position')
    .all(spaceId) as LauncherRow[]
  return rows.map(toItem)
}

export function getLauncherItem(id: number): LauncherItem | null {
  const row = rowById(id)
  return row ? toItem(row) : null
}

function nextPosition(spaceId: number): number {
  const { pos } = getDb()
    .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM launcher_items WHERE space_id = ?')
    .get(spaceId) as { pos: number }
  return pos
}

export function createUrlItem(spaceId: number, name: string, url: string): LauncherItem {
  const result = getDb()
    .prepare(
      `INSERT INTO launcher_items (space_id, name, path_or_url, kind, position)
       VALUES (?, ?, ?, 'url', ?)`
    )
    .run(spaceId, name, normalizeUrl(url), nextPosition(spaceId))
  return toItem(rowById(Number(result.lastInsertRowid))!)
}

export function createAppItem(
  spaceId: number,
  name: string,
  appPath: string,
  iconFile: string | null
): LauncherItem {
  const result = getDb()
    .prepare(
      `INSERT INTO launcher_items (space_id, name, path_or_url, icon, kind, platform, position)
       VALUES (?, ?, ?, ?, 'app', ?, ?)`
    )
    .run(spaceId, name, appPath, iconFile, process.platform, nextPosition(spaceId))
  return toItem(rowById(Number(result.lastInsertRowid))!)
}

export function renameItem(id: number, name: string): void {
  getDb().prepare('UPDATE launcher_items SET name = ? WHERE id = ?').run(name, id)
}

export function setItemIcon(id: number, iconFile: string): void {
  getDb().prepare('UPDATE launcher_items SET icon = ? WHERE id = ?').run(iconFile, id)
}

export function removeItem(id: number): void {
  getDb().prepare('DELETE FROM launcher_items WHERE id = ?').run(id)
}

// Swaps an item with its neighbour in the given direction.
export function moveItem(id: number, dir: -1 | 1): void {
  const db = getDb()
  const item = rowById(id)
  if (!item) return
  const neighbour = db
    .prepare(
      `SELECT * FROM launcher_items
       WHERE space_id = ? AND position ${dir < 0 ? '<' : '>'} ?
       ORDER BY position ${dir < 0 ? 'DESC' : 'ASC'} LIMIT 1`
    )
    .get(item.space_id, item.position) as LauncherRow | undefined
  if (!neighbour) return
  db.transaction(() => {
    db.prepare('UPDATE launcher_items SET position = ? WHERE id = ?').run(neighbour.position, item.id)
    db.prepare('UPDATE launcher_items SET position = ? WHERE id = ?').run(item.position, neighbour.id)
  })()
}

export interface LauncherTarget {
  kind: 'url' | 'app'
  pathOrUrl: string
  available: boolean
}

export function getItemTarget(id: number): LauncherTarget | null {
  const row = rowById(id)
  if (!row) return null
  return { kind: row.kind, pathOrUrl: row.path_or_url, available: isAvailable(row) }
}

// Seeds a preset's suggested apps (all URLs) as launcher items. Runs inside
// createSpace's transaction via the shared connection.
export function seedLauncher(spaceId: number, apps: { name: string; url?: string }[]): void {
  const insert = getDb().prepare(
    `INSERT INTO launcher_items (space_id, name, path_or_url, kind, position)
     VALUES (?, ?, ?, 'url', ?)`
  )
  apps.forEach((app, i) => {
    if (app.url) insert.run(spaceId, app.name, normalizeUrl(app.url), i)
  })
}
