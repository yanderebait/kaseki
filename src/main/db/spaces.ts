import { getDb } from './connection'
import { UNIVERSAL_STATUSES, getPreset } from '../../shared/presets'
import { seedLauncher } from './launcher'
import { deleteTask } from './tasks'
import { log } from '../logger'
import type { BillingMode, NewSpace, Space, SpaceBilling, SpaceDetail, SpaceEdit } from '../../shared/types'

const VALID_BILLING_MODES: BillingMode[] = ['time', 'job', 'unit', 'none']

// "Active" = not archived and not Done. There are no tasks yet, so this is
// always 0; the query is written correctly so the count is right once the
// task system lands. The exact definition of active may firm up then.
const SELECT_SPACE = `
  SELECT
    s.id,
    s.name,
    s.accent_color AS accentColor,
    s.icon,
    s.position,
    (
      SELECT count(*) FROM tasks t
      WHERE t.space_id = s.id AND t.archived = 0 AND (t.status IS NULL OR t.status != 'Done')
    ) AS activeTaskCount
  FROM spaces s
`

export function listSpaces(): Space[] {
  return getDb().prepare(`${SELECT_SPACE} WHERE s.archived = 0 ORDER BY s.position`).all() as Space[]
}

export function getSpace(id: number): Space {
  const row = getDb().prepare(`${SELECT_SPACE} WHERE s.id = ?`).get(id) as Space | undefined
  if (!row) throw new Error(`No space with id ${id}`)
  return row
}

// Creates a space and applies its full configuration atomically: preset
// linkage and the status set + cheatsheet go on the row (preferences JSON,
// since Appendix C has no table for them), custom fields go in the real
// custom_field_definitions table. A bare space (Phase 1 path) defaults to
// the universal status set.
// Two spaces with the same name are legal in the schema but hostile in every
// picker (Cmd+1-9, search, the home grid all show identical labels), so a
// duplicate gets a numeric suffix: 'Immigration', 'Immigration 2', …
function uniqueSpaceName(name: string): string {
  const db = getDb()
  const taken = new Set(
    (db.prepare('SELECT name FROM spaces').all() as Array<{ name: string }>).map((r) =>
      r.name.trim().toLowerCase()
    )
  )
  const base = name.trim() || 'Untitled space'
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

// 'Done' anchors the app's completion logic (the complete toggle, active
// counts, dependency blocking), so a status set is never stored without it.
function withDone(statusSet: string[]): string[] {
  const cleaned = statusSet.map((x) => x.trim()).filter(Boolean)
  return cleaned.includes('Done') ? cleaned : [...cleaned, 'Done']
}

export function createSpace(input: NewSpace): Space {
  const db = getDb()
  const run = db.transaction((spec: NewSpace): number => {
    const { pos } = db
      .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM spaces')
      .get() as { pos: number }
    // Seed the default billing pattern from the preset (Part 7). The user can
    // change it later (Settings → the space) and override per task. A bare or
    // custom-built space defaults to 'none' (no billing).
    const preset = spec.presetId ? getPreset(spec.presetId) : undefined
    const preferences = JSON.stringify({
      statusSet: withDone(spec.statusSet ?? UNIVERSAL_STATUSES),
      cheatsheet: spec.cheatsheet ?? '',
      billing: { mode: preset?.billing ?? 'none', rate: null }
    })
    const result = db
      .prepare(
        `INSERT INTO spaces (name, accent_color, icon, position, preset_id, preferences)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        uniqueSpaceName(spec.name),
        spec.accentColor ?? null,
        spec.icon ?? null,
        pos,
        spec.presetId ?? null,
        preferences
      )
    const spaceId = Number(result.lastInsertRowid)
    if (spec.fields?.length) {
      const insert = db.prepare(
        `INSERT INTO custom_field_definitions (space_id, name, field_type, options, position)
         VALUES (?, ?, ?, ?, ?)`
      )
      spec.fields.forEach((f, i) =>
        insert.run(spaceId, f.name, f.type, f.options ? JSON.stringify(f.options) : null, i)
      )
    }
    // Pre-load the preset's suggested apps into the launcher (Part 4).
    if (preset?.suggestedApps.length) seedLauncher(spaceId, preset.suggestedApps)
    return spaceId
  })
  return getSpace(run(input))
}

export function getSpaceDetail(id: number): SpaceDetail {
  const db = getDb()
  const space = getSpace(id)
  const row = db.prepare('SELECT preset_id AS presetId, preferences FROM spaces WHERE id = ?').get(id) as
    | { presetId: string | null; preferences: string | null }
    | undefined
  const fieldRows = db
    .prepare(
      'SELECT name, field_type AS type, options FROM custom_field_definitions WHERE space_id = ? ORDER BY position'
    )
    .all(id) as Array<{ name: string; type: SpaceDetail['fields'][number]['type']; options: string | null }>

  let prefs: { statusSet?: unknown; cheatsheet?: unknown; billing?: unknown } = {}
  try {
    prefs = row?.preferences ? JSON.parse(row.preferences) : {}
  } catch {
    prefs = {}
  }

  return {
    ...space,
    presetId: row?.presetId ?? null,
    fields: fieldRows.map((f) => ({
      name: f.name,
      type: f.type,
      options: f.options ? (JSON.parse(f.options) as string[]) : undefined
    })),
    statusSet: Array.isArray(prefs.statusSet)
      ? withDone(prefs.statusSet.filter((x): x is string => typeof x === 'string'))
      : UNIVERSAL_STATUSES,
    cheatsheet: typeof prefs.cheatsheet === 'string' ? prefs.cheatsheet : '',
    billing: readBilling(prefs.billing)
  }
}

// Normalise the billing blob from a space's preferences JSON, tolerating an
// absent or malformed value (older spaces predate the billing default).
function readBilling(raw: unknown): SpaceBilling {
  if (raw && typeof raw === 'object') {
    const b = raw as { mode?: unknown; rate?: unknown }
    const mode = VALID_BILLING_MODES.includes(b.mode as BillingMode) ? (b.mode as BillingMode) : 'none'
    const rate = typeof b.rate === 'number' ? b.rate : null
    return { mode, rate }
  }
  return { mode: 'none', rate: null }
}

// Update a space's default billing pattern (Settings → the space, Phase 10b).
// Merges into the existing preferences JSON so statusSet/cheatsheet survive.
export function setSpaceBilling(spaceId: number, billing: SpaceBilling): void {
  const db = getDb()
  const mode = VALID_BILLING_MODES.includes(billing.mode) ? billing.mode : 'none'
  const rate = typeof billing.rate === 'number' && Number.isFinite(billing.rate) ? billing.rate : null
  // Replace the whole $.billing object in one json_set so the call works even
  // when the space predates the billing default (json_set won't create a
  // missing intermediate object for a dotted path).
  db.prepare(
    `UPDATE spaces
     SET preferences = json_set(COALESCE(preferences, '{}'), '$.billing', json(?))
     WHERE id = ?`
  ).run(JSON.stringify({ mode, rate }), spaceId)
}

// Spaces stopped being immutable in v0.2.0 — a typo in a name was previously
// permanent, and the cheatsheet had no write path at all. Absent fields stay
// untouched; the name is re-uniquified only when it actually changes.
export function updateSpace(id: number, patch: SpaceEdit): void {
  const db = getDb()
  db.transaction(() => {
    const current = db.prepare('SELECT name FROM spaces WHERE id = ?').get(id) as
      | { name: string }
      | undefined
    if (!current) return
    if (patch.name !== undefined && patch.name.trim() !== current.name) {
      db.prepare('UPDATE spaces SET name = ? WHERE id = ?').run(uniqueSpaceName(patch.name), id)
    }
    if (patch.accentColor !== undefined) {
      db.prepare('UPDATE spaces SET accent_color = ? WHERE id = ?').run(patch.accentColor, id)
    }
    if (patch.icon !== undefined) {
      db.prepare('UPDATE spaces SET icon = ? WHERE id = ?').run(patch.icon, id)
    }
    if (patch.cheatsheet !== undefined) {
      db.prepare(
        "UPDATE spaces SET preferences = json_set(COALESCE(preferences, '{}'), '$.cheatsheet', ?) WHERE id = ?"
      ).run(patch.cheatsheet, id)
    }
    if (patch.statusSet !== undefined) {
      db.prepare(
        "UPDATE spaces SET preferences = json_set(COALESCE(preferences, '{}'), '$.statusSet', json(?)) WHERE id = ?"
      ).run(JSON.stringify(withDone(patch.statusSet)), id)
    }
  })()
}

// Archive hides a space from the home grid and pickers; everything in it is
// kept and it can be unarchived from Settings → Spaces.
export function archiveSpace(id: number, archived: boolean): void {
  getDb().prepare('UPDATE spaces SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id)
}

export function listArchivedSpaces(): Space[] {
  return getDb()
    .prepare(`${SELECT_SPACE} WHERE s.archived = 1 ORDER BY s.position`)
    .all() as Space[]
}

// Hard delete: the space and everything scoped to it. Tasks go through
// deleteTask so each one's full manual cascade (subtasks, values, tags,
// notes, time entries, dependencies, file links, activity) runs; then the
// space-scoped tables. Launcher icon files on disk are cleaned by the caller
// (main/launcherActions) which knows the icon directory.
export function deleteSpace(id: number): void {
  const db = getDb()
  db.transaction(() => {
    const tasks = db.prepare('SELECT id FROM tasks WHERE space_id = ?').all(id) as Array<{ id: number }>
    for (const t of tasks) deleteTask(t.id)
    const events = db.prepare('SELECT id FROM events WHERE space_id = ?').all(id) as Array<{ id: number }>
    for (const e of events) {
      db.prepare('DELETE FROM events WHERE recurrence_parent_id = ?').run(e.id)
      db.prepare(
        "DELETE FROM links WHERE (source_type = 'event' AND source_id = ?) OR (target_type = 'event' AND target_id = ?)"
      ).run(e.id, e.id)
    }
    db.prepare('DELETE FROM events WHERE space_id = ?').run(id)
    db.prepare('DELETE FROM launcher_items WHERE space_id = ?').run(id)
    db.prepare('DELETE FROM custom_field_definitions WHERE space_id = ?').run(id)
    db.prepare('DELETE FROM tags WHERE space_id = ?').run(id)
    db.prepare('DELETE FROM task_templates WHERE space_id = ?').run(id)
    db.prepare('DELETE FROM spaces WHERE id = ?').run(id)
  })()
  log.info('Space deleted', { id })
}
