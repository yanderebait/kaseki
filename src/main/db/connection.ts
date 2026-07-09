import Database from 'better-sqlite3-multiple-ciphers'
import { existsSync } from 'node:fs'
import { paths } from '../paths'
import { log } from '../logger'
import { runMigrations } from './migrations'

let handle: Database.Database | null = null

export type AuthStatus = 'setup' | 'locked' | 'unlocked'

export function getAuthStatus(): AuthStatus {
  if (handle) return 'unlocked'
  return existsSync(paths.database) ? 'locked' : 'setup'
}

export function getDb(): Database.Database {
  if (!handle) throw new Error('Database is locked')
  return handle
}

// SQLCipher derives the actual AES-256 key from the passphrase with
// PBKDF2-SHA512 (256k iterations in SQLCipher 4 compatibility mode),
// which satisfies the spec's PBKDF2 requirement without a hand-rolled KDF.
function keyDatabase(db: Database.Database, password: string): void {
  db.pragma(`cipher='sqlcipher'`)
  db.pragma(`legacy=4`)
  db.pragma(`key='${password.replace(/'/g, "''")}'`)
}

// Authentication is delegated to SQLCipher: opening the database at all
// proves the password, so we do not keep a separate, crackable password
// hash. The NOT NULL login_password_hash column (Appendix C) is retained
// for schema compatibility and possible future multi-user, and records
// only this sentinel.
const SQLCIPHER_AUTH_SENTINEL = 'sqlcipher-managed'

export function createDatabase(password: string, name: string): void {
  if (getAuthStatus() !== 'setup') throw new Error('Database already exists')
  const db = new Database(paths.database)
  try {
    keyDatabase(db, password)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    db.prepare('INSERT INTO users (name, login_password_hash) VALUES (?, ?)').run(
      name,
      SQLCIPHER_AUTH_SENTINEL
    )
  } catch (error) {
    db.close()
    throw error
  }
  handle = db
  log.info('Database created')
}

export interface User {
  name: string
}

export function getUser(): User {
  const row = getDb().prepare('SELECT name FROM users ORDER BY id LIMIT 1').get() as
    | User
    | undefined
  if (!row) throw new Error('No user row')
  return row
}

export function unlockDatabase(password: string): boolean {
  if (handle) return true
  const db = new Database(paths.database)
  try {
    keyDatabase(db, password)
    // Wrong key surfaces here as "file is not a database".
    db.prepare('SELECT count(*) FROM sqlite_master').get()
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
  } catch (error) {
    db.close()
    if (error instanceof Error && /not a database/.test(error.message)) {
      log.warn('Unlock attempt with wrong password')
      return false
    }
    throw error
  }
  handle = db
  log.info('Database unlocked')
  return true
}

// Changes the login (SQLCipher master) password. The provided current
// password is verified by opening a second, throwaway connection with it —
// the live handle was keyed at unlock and can't re-prove a password — then
// the live handle is checkpointed and rekeyed in place. Files on disk are
// re-encrypted by SQLCipher during the rekey.
export function rekeyDatabase(currentPassword: string, newPassword: string): boolean {
  const db = getDb() // throws if locked — rekey requires an unlocked session
  const probe = new Database(paths.database)
  try {
    keyDatabase(probe, currentPassword)
    probe.prepare('SELECT count(*) FROM sqlite_master').get()
  } catch (error) {
    probe.close()
    if (error instanceof Error && /not a database/.test(error.message)) {
      log.warn('Rekey attempt with wrong current password')
      return false
    }
    throw error
  }
  probe.close()
  // SQLCipher cannot rekey a WAL-mode database: fold the log into the main
  // file by switching to the rollback journal, rekey, then restore WAL.
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.pragma('journal_mode = DELETE')
  try {
    db.pragma(`rekey='${newPassword.replace(/'/g, "''")}'`)
  } finally {
    db.pragma('journal_mode = WAL')
  }
  log.info('Database rekeyed')
  return true
}

export function closeDatabase(): void {
  if (handle) {
    handle.close()
    handle = null
    log.info('Database closed')
  }
}
