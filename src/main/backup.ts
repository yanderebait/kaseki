import { app, BrowserWindow, dialog } from 'electron'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { paths } from './paths'
import { closeDatabase, getAuthStatus, getDb } from './db/connection'
import { getPreferences, setPreferences } from './db/prefs'
import { lock as lockVault } from './vault/store'
import { appVersion } from './version'
import { log } from './logger'
import {
  backupFolderName,
  backupsToPrune,
  normalizeBackupConfig,
  scheduledBackupDue,
  type BackupConfig,
  type BackupManifest,
  type BackupResult
} from '../shared/backup'

// Built-in backup and restore (Part 14 #7, finished in v0.3.0). Until now the
// only supported backup was "quit and copy the data folder by hand". This does
// the same copy from inside the app, safely while it is running, on demand or
// on a schedule, and can put a backup back.
//
// What a backup contains: the encrypted database and the four content folders.
// Logs are left out (they are diagnostics, not data), and so is the undo copy
// a restore leaves behind. Nothing is decrypted to make a backup — the files
// are copied as they sit on disk — so a backup is exactly as protected as the
// live data, and exactly as useless without the login password.

const MANIFEST = 'kaseki-backup.json'
const DB_FILE = 'kaseki.db'
const CONTENT_DIRS = ['uploads', 'sensitive', 'backgrounds', 'icons'] as const
const UNDO_DIR = 'restore-undo'

export function backupConfig(): BackupConfig {
  return normalizeBackupConfig(getPreferences().backup)
}

function saveConfig(patch: Partial<BackupConfig>): BackupConfig {
  const next = { ...backupConfig(), ...patch }
  setPreferences({ backup: next })
  return next
}

// True when `child` is `parent` itself or somewhere beneath it.
export function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function measure(dir: string): { files: number; bytes: number } {
  let files = 0
  let bytes = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const inner = measure(full)
      files += inner.files
      bytes += inner.bytes
    } else if (entry.isFile()) {
      files += 1
      bytes += statSync(full).size
    }
  }
  return { files, bytes }
}

// Copies the live data into `<destRoot>/Kaseki-backup-<stamp>/`. The database
// runs in WAL mode, so recent writes may still be in the -wal file; folding
// the log into the main file first means the single .db copied is complete
// and consistent. The copy is written under a temporary name and renamed into
// place, so an interrupted backup never looks like a finished one.
export function createBackup(destRoot: string, at: Date = new Date()): BackupResult {
  const finalPath = join(destRoot, backupFolderName(at))
  const tempPath = `${finalPath}.partial`
  try {
    if (!existsSync(destRoot) || !statSync(destRoot).isDirectory()) {
      return { ok: false, error: 'The backup folder does not exist.' }
    }
    // A backup inside the data folder would be copied into the next backup.
    if (isInside(paths.root, destRoot)) {
      return { ok: false, error: 'Choose a folder outside Kaseki’s own data folder.' }
    }
    if (existsSync(finalPath)) return { ok: false, error: 'A backup with this timestamp already exists.' }
    if (!existsSync(paths.database)) return { ok: false, error: 'There is no database to back up yet.' }

    if (getAuthStatus() === 'unlocked') getDb().pragma('wal_checkpoint(TRUNCATE)')

    rmSync(tempPath, { recursive: true, force: true })
    mkdirSync(tempPath, { recursive: true })
    cpSync(paths.database, join(tempPath, DB_FILE))
    for (const name of CONTENT_DIRS) {
      const src = join(paths.root, name)
      if (existsSync(src)) cpSync(src, join(tempPath, name), { recursive: true })
      else mkdirSync(join(tempPath, name), { recursive: true })
    }
    const { files, bytes } = measure(tempPath)
    const manifest: BackupManifest = {
      app: 'kaseki',
      version: appVersion,
      createdAt: at.toISOString(),
      files,
      bytes
    }
    writeFileSync(join(tempPath, MANIFEST), JSON.stringify(manifest, null, 2))
    renameSync(tempPath, finalPath)
    log.info('Backup written', { files, bytes })
    return { ok: true, path: finalPath, files, bytes }
  } catch (error) {
    rmSync(tempPath, { recursive: true, force: true })
    log.error('Backup failed', error)
    return { ok: false, error: 'The backup could not be written. See logs for details.' }
  }
}

// Removes the oldest Kaseki backups in a folder so only `keep` remain.
export function pruneBackups(destRoot: string, keep: number): number {
  let removed = 0
  try {
    for (const name of backupsToPrune(readdirSync(destRoot), keep)) {
      rmSync(join(destRoot, name), { recursive: true, force: true })
      removed += 1
    }
  } catch (error) {
    log.warn('Backup pruning failed', String(error))
  }
  return removed
}

export function readManifest(dir: string): BackupManifest | null {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, MANIFEST), 'utf8')) as Record<string, unknown>
    if (parsed.app !== 'kaseki' || typeof parsed.createdAt !== 'string') return null
    return {
      app: 'kaseki',
      version: typeof parsed.version === 'string' ? parsed.version : 'unknown',
      createdAt: parsed.createdAt,
      files: typeof parsed.files === 'number' ? parsed.files : 0,
      bytes: typeof parsed.bytes === 'number' ? parsed.bytes : 0
    }
  } catch {
    return null
  }
}

// A folder is restorable if it holds a database. A hand-made copy of the data
// folder has no manifest and is accepted too — that was the documented backup
// method before 0.3.0.
export function isRestorable(dir: string): boolean {
  try {
    return statSync(join(dir, DB_FILE)).isFile()
  } catch {
    return false
  }
}

// Replaces the live data with a backup's. The database must already be closed.
// The current data is not deleted: it is moved into `<data>/restore-undo/` so
// a restore of the wrong backup can itself be undone by hand. If the copy
// fails partway, whatever was moved aside is moved back.
export function restoreInto(root: string, backupDir: string, at: Date = new Date()): string {
  // A backup inside the data folder (the undo copy itself, say) would be moved
  // aside or deleted halfway through being read.
  if (isInside(root, backupDir)) {
    throw new Error('Refusing to restore from a folder inside the data folder')
  }
  const undoRoot = join(root, UNDO_DIR)
  const undoDir = join(undoRoot, backupFolderName(at).replace('Kaseki-backup-', 'before-restore-'))
  // Keep one undo copy, not an ever-growing pile of whole-database snapshots.
  rmSync(undoRoot, { recursive: true, force: true })
  mkdirSync(undoDir, { recursive: true })

  const live = [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`, ...CONTENT_DIRS]
  const moved: string[] = []
  try {
    for (const name of live) {
      const current = join(root, name)
      if (!existsSync(current)) continue
      renameSync(current, join(undoDir, name))
      moved.push(name)
    }
    cpSync(join(backupDir, DB_FILE), join(root, DB_FILE))
    for (const name of CONTENT_DIRS) {
      const src = join(backupDir, name)
      if (existsSync(src)) cpSync(src, join(root, name), { recursive: true })
      else mkdirSync(join(root, name), { recursive: true })
    }
    return undoDir
  } catch (error) {
    for (const name of live) rmSync(join(root, name), { recursive: true, force: true })
    for (const name of moved) renameSync(join(undoDir, name), join(root, name))
    throw error
  }
}

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

async function pickFolder(title: string): Promise<string | null> {
  const win = focusedWindow()
  const options: Electron.OpenDialogOptions = { title, properties: ['openDirectory', 'createDirectory'] }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
}

function record(result: BackupResult, at: Date): void {
  if (result.ok) saveConfig({ lastAt: at.toISOString(), lastPath: result.path ?? null, lastError: null })
  else if (!result.cancelled) saveConfig({ lastError: result.error ?? 'Backup failed.' })
}

// "Back up now": to the configured folder, or — if none is set — a folder the
// user picks, which is then remembered.
export async function backupNow(): Promise<BackupResult> {
  let folder = backupConfig().folder
  if (!folder) {
    const picked = await pickFolder('Choose where Kaseki backups are kept')
    if (!picked) return { ok: false, cancelled: true }
    folder = picked
    saveConfig({ folder })
  }
  const at = new Date()
  const result = createBackup(folder, at)
  record(result, at)
  if (result.ok) pruneBackups(folder, backupConfig().keep)
  return result
}

export async function chooseBackupFolder(): Promise<BackupConfig> {
  const picked = await pickFolder('Choose where Kaseki backups are kept')
  return picked ? saveConfig({ folder: picked, lastError: null }) : backupConfig()
}

export function updateBackupConfig(patch: { schedule?: unknown; keep?: unknown }): BackupConfig {
  const next = normalizeBackupConfig({ ...backupConfig(), ...patch })
  return saveConfig({ schedule: next.schedule, keep: next.keep })
}

// A failed scheduled backup (folder unplugged, disk full) is retried hourly,
// not on every one-minute tick.
const SCHEDULED_RETRY_MS = 60 * 60 * 1000
let lastScheduledFailure: number | null = null

// Called from the background tick: runs a scheduled backup when one is due.
export function runScheduledBackup(now: Date = new Date()): BackupResult | null {
  const config = backupConfig()
  if (!scheduledBackupDue(config, now)) return null
  if (lastScheduledFailure !== null) {
    const since = now.getTime() - lastScheduledFailure
    if (since >= 0 && since < SCHEDULED_RETRY_MS) return null
  }
  const result = createBackup(config.folder, now)
  record(result, now)
  lastScheduledFailure = result.ok ? null : now.getTime()
  if (result.ok) pruneBackups(config.folder, config.keep)
  return result
}

// "Restore from a backup": pick a backup folder, confirm, swap the data, and
// relaunch so the app reopens on the restored database (unlocked with the
// password that backup was made under).
export async function restoreFromBackup(): Promise<BackupResult> {
  const dir = await pickFolder('Choose the backup to restore')
  if (!dir) return { ok: false, cancelled: true }
  if (!isRestorable(dir)) {
    return { ok: false, error: 'That folder is not a Kaseki backup — it has no kaseki.db in it.' }
  }
  if (isInside(paths.root, dir)) {
    return {
      ok: false,
      error: 'That folder is inside Kaseki’s own data folder. Copy it somewhere else first, then restore from the copy.'
    }
  }
  const manifest = readManifest(dir)
  const when = manifest ? new Date(manifest.createdAt).toLocaleString() : 'an unknown date'
  const win = focusedWindow()
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    buttons: ['Cancel', 'Restore and restart'],
    defaultId: 0,
    cancelId: 0,
    title: 'Restore from backup',
    message: `Replace everything in Kaseki with the backup from ${when}?`,
    detail:
      'Your current data is moved aside into a "restore-undo" folder inside the data folder, not deleted. ' +
      'Kaseki then restarts, and you unlock it with the password that backup was made under.'
  }
  const choice = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
  if (choice.response !== 1) return { ok: false, cancelled: true }

  try {
    lockVault()
    closeDatabase()
    const undoDir = restoreInto(paths.root, dir)
    log.info('Restored from backup', { undoDir })
  } catch (error) {
    log.error('Restore failed', error)
    // The database is closed either way; restart so the app is in a known state.
    app.relaunch()
    app.exit(0)
    return { ok: false, error: 'The restore failed and your data was left as it was.' }
  }
  app.relaunch()
  app.exit(0)
  return { ok: true, path: dir }
}
