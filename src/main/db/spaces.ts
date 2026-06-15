import { getDb } from './connection'
import { UNIVERSAL_STATUSES, getPreset } from '../../shared/presets'
import { seedLauncher } from './launcher'
import type { BillingMode, NewSpace, Space, SpaceBilling, SpaceDetail } from '../../shared/types'

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
      statusSet: spec.statusSet ?? UNIVERSAL_STATUSES,
      cheatsheet: spec.cheatsheet ?? '',
      billing: { mode: preset?.billing ?? 'none', rate: null }
    })
    const result = db
      .prepare(
        `INSERT INTO spaces (name, accent_color, icon, position, preset_id, preferences)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(spec.name, spec.accentColor ?? null, spec.icon ?? null, pos, spec.presetId ?? null, preferences)
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
    statusSet: Array.isArray(prefs.statusSet) ? (prefs.statusSet as string[]) : UNIVERSAL_STATUSES,
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
