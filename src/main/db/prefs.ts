import { getDb } from './connection'

// UI preferences live as a single JSON blob on the user row (Appendix C:
// users.preferences). Storage is intentionally schema-free — any small UI
// preference (theme, widget view mode, card-compaction threshold, …) is a
// key here, so adding one never needs a migration. Reads tolerate a null
// or corrupt blob by returning an empty object.
export type Preferences = Record<string, unknown>

export function getPreferences(): Preferences {
  const row = getDb().prepare('SELECT preferences FROM users ORDER BY id LIMIT 1').get() as
    | { preferences: string | null }
    | undefined
  if (!row?.preferences) return {}
  try {
    const parsed: unknown = JSON.parse(row.preferences)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Preferences) : {}
  } catch {
    return {}
  }
}

export function setPreferences(patch: Preferences): Preferences {
  const merged = { ...getPreferences(), ...patch }
  getDb()
    .prepare('UPDATE users SET preferences = ? WHERE id = (SELECT id FROM users ORDER BY id LIMIT 1)')
    .run(JSON.stringify(merged))
  return merged
}
