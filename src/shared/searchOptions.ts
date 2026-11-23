import type { SearchHitType } from './types'

// Global-search preferences (Part 14 #10, finished in v0.3.0): which kinds of
// thing Cmd/Ctrl+K looks through, and how many results each kind may show.
// Stored in the preferences blob as `search`.

export const SEARCH_TYPES: SearchHitType[] = [
  'task',
  'subtask',
  'event',
  'knowledge',
  'file',
  'space',
  'bundle',
  'vault'
]

export const SEARCH_TYPE_LABELS: Record<SearchHitType, string> = {
  task: 'Tasks and task notes',
  subtask: 'Subtasks',
  event: 'Calendar events',
  knowledge: 'Knowledge pages',
  file: 'Files',
  space: 'Spaces',
  bundle: 'Bundles',
  vault: 'Sensitive folder (only while unlocked)'
}

export const MAX_PER_TYPE_OPTIONS = [5, 8, 12, 20]
export const DEFAULT_MAX_PER_TYPE = 8

export interface SearchOptions {
  types: Record<SearchHitType, boolean>
  maxPerType: number
}

export function defaultSearchOptions(): SearchOptions {
  const types = {} as Record<SearchHitType, boolean>
  for (const t of SEARCH_TYPES) types[t] = true
  return { types, maxPerType: DEFAULT_MAX_PER_TYPE }
}

// Every type defaults to on, so a type added in a later version is searched
// without the user having to find a new checkbox.
export function normalizeSearchOptions(raw: unknown): SearchOptions {
  const out = defaultSearchOptions()
  if (typeof raw !== 'object' || raw === null) return out
  const o = raw as Record<string, unknown>
  if (typeof o.types === 'object' && o.types !== null) {
    const t = o.types as Record<string, unknown>
    for (const type of SEARCH_TYPES) if (t[type] === false) out.types[type] = false
  }
  if (typeof o.maxPerType === 'number' && o.maxPerType >= 1 && o.maxPerType <= 50) {
    out.maxPerType = Math.floor(o.maxPerType)
  }
  return out
}
