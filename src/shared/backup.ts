// Built-in backup and restore (Part 14 #7, finished in v0.3.0). A backup is a
// plain folder — a copy of the data directory's contents — so it can be
// inspected, moved, and restored by hand exactly like the copy-the-folder
// method it replaces. The database and the sensitive folder are already
// encrypted at rest, so the backup is encrypted too. Pure helpers live here;
// the file work is in src/main/backup.ts.

export type BackupSchedule = 'off' | 'daily' | 'weekly'

export interface BackupConfig {
  folder: string // where scheduled backups go; '' = not chosen
  schedule: BackupSchedule
  keep: number // how many scheduled backups to keep in that folder
  lastAt: string | null
  lastPath: string | null
  lastError: string | null
}

export const DEFAULT_BACKUP: BackupConfig = {
  folder: '',
  schedule: 'off',
  keep: 5,
  lastAt: null,
  lastPath: null,
  lastError: null
}

export const KEEP_OPTIONS = [3, 5, 10, 20]

export function normalizeBackupConfig(raw: unknown): BackupConfig {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_BACKUP }
  const o = raw as Record<string, unknown>
  const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
  return {
    folder: typeof o.folder === 'string' ? o.folder : '',
    schedule: o.schedule === 'daily' || o.schedule === 'weekly' ? o.schedule : 'off',
    keep: typeof o.keep === 'number' && o.keep >= 1 && o.keep <= 100 ? Math.floor(o.keep) : 5,
    lastAt: str(o.lastAt),
    lastPath: str(o.lastPath),
    lastError: str(o.lastError)
  }
}

const p2 = (n: number): string => String(n).padStart(2, '0')

export const BACKUP_PREFIX = 'Kaseki-backup-'
const BACKUP_NAME_RE = /^Kaseki-backup-\d{4}-\d{2}-\d{2}-\d{6}$/

// 'Kaseki-backup-2026-11-23-174502' — local time, sortable as text.
export function backupFolderName(at: Date): string {
  return (
    `${BACKUP_PREFIX}${at.getFullYear()}-${p2(at.getMonth() + 1)}-${p2(at.getDate())}` +
    `-${p2(at.getHours())}${p2(at.getMinutes())}${p2(at.getSeconds())}`
  )
}

export function isBackupFolderName(name: string): boolean {
  return BACKUP_NAME_RE.test(name)
}

// Given the entries of the backup folder, the Kaseki backups to delete so only
// the newest `keep` remain. Anything not named like a Kaseki backup is never
// touched — the folder may hold the user's other files.
export function backupsToPrune(names: string[], keep: number): string[] {
  const backups = names.filter(isBackupFolderName).sort()
  return backups.slice(0, Math.max(0, backups.length - Math.max(1, keep)))
}

const DAY_MS = 24 * 60 * 60 * 1000

// A scheduled backup is due when a schedule and a folder are set and the last
// successful one is missing or older than the interval.
export function scheduledBackupDue(config: BackupConfig, now: Date): boolean {
  if (config.schedule === 'off' || !config.folder) return false
  if (!config.lastAt) return true
  const last = new Date(config.lastAt).getTime()
  if (Number.isNaN(last)) return true
  const age = now.getTime() - last
  return age < 0 || age >= (config.schedule === 'daily' ? DAY_MS : 7 * DAY_MS)
}

export interface BackupResult {
  ok: boolean
  path?: string
  files?: number
  bytes?: number
  error?: string
  cancelled?: boolean
}

export interface BackupManifest {
  app: 'kaseki'
  version: string
  createdAt: string
  files: number
  bytes: number
}
