import { BrowserWindow } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDb } from '../db/connection'
import { deriveKind, deriveMime } from '../db/files'
import { getPreferences } from '../db/prefs'
import { paths } from '../paths'
import type { VaultFile, VaultStatus } from '../../shared/types'
import {
  deriveKeyFromEntropy,
  deriveKeyFromPasscode,
  generateMnemonic,
  mnemonicToEntropy,
  open,
  randomKey,
  randomSalt,
  seal,
  tryOpen
} from './crypto'

// The sensitive folder's data layer (Part 11). The unlocked Data Encryption
// Key lives only here, in main-process memory; it is never written to disk and
// never crosses to the renderer. Locking zeroes it, and it is always absent
// after a restart.
let dek: Buffer | null = null
let lockTimer: ReturnType<typeof setTimeout> | null = null

// Best-effort: overwrite the key bytes before dropping the reference. Node
// can't guarantee no copies linger in freed memory, but this avoids leaving
// the live key sitting in a long-lived buffer.
function forgetDek(): void {
  if (lockTimer) {
    clearTimeout(lockTimer)
    lockTimer = null
  }
  if (dek) dek.fill(0)
  dek = null
}

// Tells every window the vault's lock state changed, so the renderer can flip
// to the locked pane the moment an auto-lock fires instead of sitting on a
// stale "unlocked" view (whose next action would just fail).
function broadcastVaultChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('vault:changed', vaultStatus())
  }
}

// (Re)arms the inactivity auto-lock from the user's preference (minutes; 0 or
// absent = stay unlocked until the app closes, the default). Called on unlock
// and on every vault operation, so any activity resets the countdown.
function armAutoLock(): void {
  if (lockTimer) {
    clearTimeout(lockTimer)
    lockTimer = null
  }
  const minutes = Number(getPreferences().vaultAutoLock) || 0
  if (dek && minutes > 0) lockTimer = setTimeout(() => lock(), minutes * 60_000)
}

// Called when the vaultAutoLock preference changes so a running countdown
// picks the new value up immediately (it previously applied only after the
// next vault operation).
export function rearmAutoLock(): void {
  armAutoLock()
}

interface VaultRow {
  passcode_salt: Buffer
  recovery_salt: Buffer
  dek_wrapped_passcode: Buffer
  dek_wrapped_recovery: Buffer
}

function vaultRow(): VaultRow | undefined {
  return getDb().prepare('SELECT * FROM vault WHERE id = 1').get() as VaultRow | undefined
}

export function vaultStatus(): VaultStatus {
  if (!vaultRow()) return 'absent'
  return dek ? 'unlocked' : 'locked'
}

export function isUnlocked(): boolean {
  return dek !== null
}

function requireDek(): Buffer {
  if (!dek) throw new Error('vault is locked')
  armAutoLock() // any vault activity resets the inactivity timer
  return dek
}

// Creates the vault: a fresh random DEK wrapped by the passcode key and by a
// new recovery phrase's key. Returns the 24-word phrase to show once — it is
// never stored, only its wrapping of the DEK is. Leaves the vault unlocked.
export async function createVault(passcode: string): Promise<{ mnemonic: string }> {
  if (vaultRow()) throw new Error('vault already exists')
  const newDek = randomKey()
  const passcodeSalt = randomSalt()
  const recoverySalt = randomSalt()
  const mnemonic = generateMnemonic()

  const kekPass = await deriveKeyFromPasscode(passcode, passcodeSalt)
  const kekRec = deriveKeyFromEntropy(mnemonicToEntropy(mnemonic), recoverySalt)

  getDb()
    .prepare(
      `INSERT INTO vault (id, passcode_salt, recovery_salt, dek_wrapped_passcode, dek_wrapped_recovery)
       VALUES (1, ?, ?, ?, ?)`
    )
    .run(passcodeSalt, recoverySalt, seal(kekPass, newDek), seal(kekRec, newDek))

  kekPass.fill(0)
  kekRec.fill(0)
  dek = newDek
  armAutoLock()
  broadcastVaultChanged()
  return { mnemonic }
}

// Tries to unlock with the passcode. Wrong passcode → false (the GCM tag on
// the wrapped DEK fails to verify); no error surfaces.
export async function unlock(passcode: string): Promise<boolean> {
  const row = vaultRow()
  if (!row) return false
  const kek = await deriveKeyFromPasscode(passcode, row.passcode_salt)
  const unwrapped = tryOpen(kek, row.dek_wrapped_passcode)
  kek.fill(0)
  if (!unwrapped) return false
  forgetDek()
  dek = unwrapped
  armAutoLock()
  broadcastVaultChanged()
  return true
}

export function lock(): void {
  forgetDek()
  broadcastVaultChanged()
}

// Changes the passcode: verifies the old one, then re-wraps the DEK under a
// new passcode key with a fresh salt. Files are untouched. Every key copy is
// zeroed before it goes out of scope — the lock path is careful about this
// and the rewrap paths previously weren't.
export async function changePasscode(oldPasscode: string, newPasscode: string): Promise<boolean> {
  const row = vaultRow()
  if (!row) return false
  const oldKek = await deriveKeyFromPasscode(oldPasscode, row.passcode_salt)
  const currentDek = tryOpen(oldKek, row.dek_wrapped_passcode)
  oldKek.fill(0)
  if (!currentDek) return false
  const newSalt = randomSalt()
  const kek = await deriveKeyFromPasscode(newPasscode, newSalt)
  getDb()
    .prepare('UPDATE vault SET passcode_salt = ?, dek_wrapped_passcode = ? WHERE id = 1')
    .run(newSalt, seal(kek, currentDek))
  kek.fill(0)
  currentDek.fill(0)
  return true
}

// Resets the passcode using the recovery phrase: unwraps the DEK via the
// recovery key and re-wraps it under a new passcode. Lets a user who forgot
// the passcode set a new one without losing any files.
export async function resetWithRecovery(mnemonic: string, newPasscode: string): Promise<boolean> {
  const row = vaultRow()
  if (!row) return false
  let entropy: Buffer
  try {
    entropy = mnemonicToEntropy(mnemonic)
  } catch {
    return false
  }
  const recKek = deriveKeyFromEntropy(entropy, row.recovery_salt)
  const currentDek = tryOpen(recKek, row.dek_wrapped_recovery)
  recKek.fill(0)
  if (!currentDek) return false
  const newSalt = randomSalt()
  const kek = await deriveKeyFromPasscode(newPasscode, newSalt)
  getDb()
    .prepare('UPDATE vault SET passcode_salt = ?, dek_wrapped_passcode = ? WHERE id = 1')
    .run(newSalt, seal(kek, currentDek))
  kek.fill(0)
  currentDek.fill(0)
  return true
}

interface VaultFileRow {
  id: number
  name_enc: Buffer
  mime_enc: Buffer
  size: number
  content_hash: string
  blob_name: string
  created_at: string
}

function rowToVaultFile(row: VaultFileRow, key: Buffer): VaultFile {
  const name = open(key, row.name_enc).toString('utf8')
  return {
    id: row.id,
    name,
    mime: open(key, row.mime_enc).toString('utf8'),
    size: row.size,
    kind: deriveKind(name),
    createdAt: row.created_at
  }
}

// Encrypts a file into the vault. Identical content (same plaintext SHA-256)
// is added once — the existing entry is returned. The plaintext is read into
// memory, encrypted, and only the ciphertext is written to disk.
export function addFile(sourcePath: string, displayName?: string): VaultFile {
  const key = requireDek()
  const db = getDb()
  const bytes = readFileSync(sourcePath)
  const hash = createHash('sha256').update(bytes).digest('hex')

  const existing = db.prepare('SELECT * FROM vault_files WHERE content_hash = ?').get(hash) as
    | VaultFileRow
    | undefined
  if (existing) return rowToVaultFile(existing, key)

  const name = displayName ?? sourcePath.split(/[/\\]/).pop() ?? 'file'
  const blobName = randomBytes(16).toString('hex')
  writeFileSync(join(paths.sensitive, blobName), seal(key, bytes))

  const result = db
    .prepare(
      `INSERT INTO vault_files (name_enc, mime_enc, size, content_hash, blob_name)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(seal(key, Buffer.from(name, 'utf8')), seal(key, Buffer.from(deriveMime(name), 'utf8')), bytes.length, hash, blobName)
  return rowToVaultFile(
    db.prepare('SELECT * FROM vault_files WHERE id = ?').get(Number(result.lastInsertRowid)) as VaultFileRow,
    key
  )
}

export function listVaultFiles(): VaultFile[] {
  const key = requireDek()
  const rows = getDb()
    .prepare('SELECT * FROM vault_files ORDER BY created_at DESC, id DESC')
    .all() as VaultFileRow[]
  return rows.map((r) => rowToVaultFile(r, key))
}

export function getVaultFile(id: number): VaultFile | null {
  const key = requireDek()
  const row = getDb().prepare('SELECT * FROM vault_files WHERE id = ?').get(id) as
    | VaultFileRow
    | undefined
  return row ? rowToVaultFile(row, key) : null
}

// Decrypts a file's bytes in memory (for the viewer). Never writes plaintext
// to disk.
export function readVaultFile(id: number): { bytes: Buffer; mime: string } | null {
  const key = requireDek()
  const row = getDb().prepare('SELECT * FROM vault_files WHERE id = ?').get(id) as
    | VaultFileRow
    | undefined
  if (!row) return null
  const blobPath = join(paths.sensitive, row.blob_name)
  if (!existsSync(blobPath)) return null
  return { bytes: open(key, readFileSync(blobPath)), mime: open(key, row.mime_enc).toString('utf8') }
}

export function renameVaultFile(id: number, newName: string): void {
  const key = requireDek()
  getDb()
    .prepare('UPDATE vault_files SET name_enc = ?, mime_enc = ? WHERE id = ?')
    .run(seal(key, Buffer.from(newName, 'utf8')), seal(key, Buffer.from(deriveMime(newName), 'utf8')), id)
}

export function deleteVaultFile(id: number): void {
  const db = getDb()
  const row = db.prepare('SELECT blob_name FROM vault_files WHERE id = ?').get(id) as
    | { blob_name: string }
    | undefined
  if (!row) return
  db.prepare('DELETE FROM vault_files WHERE id = ?').run(id)
  rmSync(join(paths.sensitive, row.blob_name), { force: true })
}
