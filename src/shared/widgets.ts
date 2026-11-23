// Home-screen widgets (Part 5, finished in v0.3.0). Phase 1 shipped the widget
// area as five inert placeholders; this is the real model behind it.
//
// A layout is an ordered list of widget types, each present at most once, kept
// in the preferences blob (`widgets`) so it needs no migration. Each widget's
// own data is a preferences key too (`widgetNotes`, `widgetClocks`,
// `widgetBookmarks`); Upcoming reads the live database and Weather goes through
// the main process, because the renderer has no network access of its own.
//
// Everything here is pure so the self-test suite can pin it.

export const WIDGET_TYPES = ['notes', 'upcoming', 'clocks', 'bookmarks', 'weather'] as const
export type WidgetType = (typeof WIDGET_TYPES)[number]

export interface WidgetMeta {
  type: WidgetType
  name: string
  description: string
  // Weather is the only widget that talks to the network, and only once the
  // user has switched it on and set a location (Settings → Weather widget).
  network: boolean
}

export const WIDGET_META: Record<WidgetType, WidgetMeta> = {
  notes: {
    type: 'notes',
    name: 'Quick Notes',
    description: 'Scratchpad for ideas and lists',
    network: false
  },
  upcoming: {
    type: 'upcoming',
    name: 'Upcoming',
    description: 'Deadlines and events across spaces',
    network: false
  },
  clocks: {
    type: 'clocks',
    name: 'World Clocks',
    description: 'Multiple time zones at a glance',
    network: false
  },
  bookmarks: {
    type: 'bookmarks',
    name: 'Bookmarks',
    description: 'Quick links to frequent URLs',
    network: false
  },
  weather: {
    type: 'weather',
    name: 'Weather',
    description: 'Current conditions and forecast',
    network: true
  }
}

// What a fresh install shows. Weather is deliberately absent: nothing that
// makes a network request is ever on by default.
export const DEFAULT_WIDGETS: WidgetType[] = ['upcoming', 'notes', 'clocks', 'bookmarks']

function isWidgetType(value: unknown): value is WidgetType {
  return typeof value === 'string' && (WIDGET_TYPES as readonly string[]).includes(value)
}

// Reads the stored layout defensively: unknown types are dropped, duplicates
// collapse to their first position, and anything that isn't an array (a fresh
// install, a corrupt blob) falls back to the default. An explicitly empty
// array is respected — the user removed every widget on purpose.
export function normalizeLayout(raw: unknown): WidgetType[] {
  if (!Array.isArray(raw)) return [...DEFAULT_WIDGETS]
  const out: WidgetType[] = []
  for (const item of raw) {
    if (isWidgetType(item) && !out.includes(item)) out.push(item)
  }
  return out
}

export function addWidget(layout: WidgetType[], type: WidgetType): WidgetType[] {
  return layout.includes(type) ? layout : [...layout, type]
}

export function removeWidget(layout: WidgetType[], type: WidgetType): WidgetType[] {
  return layout.filter((t) => t !== type)
}

// Moves a widget one place earlier (-1) or later (+1); a move off either end
// is a no-op. Same up/down contract as the launcher and bundle lists.
export function moveWidget(layout: WidgetType[], type: WidgetType, dir: -1 | 1): WidgetType[] {
  const i = layout.indexOf(type)
  const j = i + dir
  if (i < 0 || j < 0 || j >= layout.length) return layout
  const next = [...layout]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

export function availableWidgets(layout: WidgetType[]): WidgetType[] {
  return WIDGET_TYPES.filter((t) => !layout.includes(t))
}

// --- Quick Notes -----------------------------------------------------------

export const NOTES_MAX_LENGTH = 20000

export function normalizeNotes(raw: unknown): string {
  return typeof raw === 'string' ? raw.slice(0, NOTES_MAX_LENGTH) : ''
}

// --- Bookmarks -------------------------------------------------------------

export interface WidgetBookmark {
  name: string
  url: string
}

export const BOOKMARKS_MAX = 24

// Bookmarks open in the OS browser, so only web links are allowed — the same
// rule the main process applies to every external open. A bare host
// ("example.com", "localhost:3000") is promoted to https — a "name:" followed
// by a digit is a port, not a scheme. Returns null for anything else.
export function normalizeBookmarkUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const candidate = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null
    return url.toString()
  } catch {
    return null
  }
}

export function normalizeBookmarks(raw: unknown): WidgetBookmark[] {
  if (!Array.isArray(raw)) return []
  const out: WidgetBookmark[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const o = item as Record<string, unknown>
    const url = typeof o.url === 'string' ? normalizeBookmarkUrl(o.url) : null
    if (!url) continue
    const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : new URL(url).hostname
    out.push({ name: name.slice(0, 60), url })
    if (out.length >= BOOKMARKS_MAX) break
  }
  return out
}

// --- World clocks ----------------------------------------------------------

export const CLOCKS_MAX = 6
export const DEFAULT_CLOCKS = ['Europe/London', 'America/New_York', 'Asia/Tokyo']

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export function normalizeClocks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_CLOCKS]
  const out: string[] = []
  for (const item of raw) {
    if (typeof item === 'string' && isValidTimeZone(item) && !out.includes(item)) out.push(item)
    if (out.length >= CLOCKS_MAX) break
  }
  return out
}

// "America/New_York" → "New York". The last path segment is the city.
export function zoneLabel(zone: string): string {
  return (zone.split('/').pop() ?? zone).replace(/_/g, ' ')
}

// How far a zone is from the viewer's own, as a signed label ("+5h",
// "−3h 30m", "same time"). Computed from the two wall clocks at one instant,
// so it is right on both sides of either zone's daylight-saving change.
export function zoneOffsetLabel(zone: string, localZone: string, at: Date): string {
  const wall = (tz: string): number => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).formatToParts(at)
    const n = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0)
    return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'))
  }
  const minutes = Math.round((wall(zone) - wall(localZone)) / 60000)
  if (minutes === 0) return 'same time'
  const sign = minutes > 0 ? '+' : '−'
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return m === 0 ? `${sign}${h}h` : `${sign}${h}h ${m}m`
}

// --- Upcoming --------------------------------------------------------------

export interface UpcomingItem {
  kind: 'task' | 'event'
  id: number // task id, or the event's master id
  title: string
  // Tasks: the bare due date ('YYYY-MM-DD'). Events: the occurrence start ISO.
  when: string
  allDay: boolean
  overdue: boolean
  spaceId: number | null
  spaceName: string | null
  accentColor: string | null
}

// --- Weather ---------------------------------------------------------------

export type WeatherUnits = 'celsius' | 'fahrenheit'

export interface WeatherConfig {
  enabled: boolean
  name: string // display name of the chosen place
  latitude: number | null
  longitude: number | null
  units: WeatherUnits
}

export const DEFAULT_WEATHER: WeatherConfig = {
  enabled: false,
  name: '',
  latitude: null,
  longitude: null,
  units: 'celsius'
}

export function normalizeWeatherConfig(raw: unknown): WeatherConfig {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_WEATHER }
  const o = raw as Record<string, unknown>
  const num = (v: unknown, min: number, max: number): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null
  const latitude = num(o.latitude, -90, 90)
  const longitude = num(o.longitude, -180, 180)
  const located = latitude !== null && longitude !== null
  return {
    enabled: o.enabled === true,
    name: typeof o.name === 'string' ? o.name.slice(0, 80) : '',
    latitude: located ? latitude : null,
    longitude: located ? longitude : null,
    units: o.units === 'fahrenheit' ? 'fahrenheit' : 'celsius'
  }
}

// The widget only ever makes a request when it is both switched on and has a
// location — the single gate the main process checks before any fetch.
export function weatherReady(config: WeatherConfig): boolean {
  return config.enabled && config.latitude !== null && config.longitude !== null
}

export interface WeatherPlace {
  name: string
  region: string // "England, United Kingdom"
  latitude: number
  longitude: number
}

export interface WeatherDay {
  date: string // 'YYYY-MM-DD'
  code: number
  high: number
  low: number
}

export interface WeatherReport {
  place: string
  units: WeatherUnits
  temperature: number
  code: number
  days: WeatherDay[]
  fetchedAt: string
}

export type WeatherResult =
  | { status: 'off' } // not switched on
  | { status: 'unset' } // on, but no location chosen
  | { status: 'ok'; report: WeatherReport }
  | { status: 'error'; message: string }

// WMO weather interpretation codes, as returned by Open-Meteo.
export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear'
  if (code === 1) return 'Mostly clear'
  if (code === 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if (code >= 61 && code <= 67) return 'Rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 80 && code <= 82) return 'Showers'
  if (code === 85 || code === 86) return 'Snow showers'
  if (code >= 95 && code <= 99) return 'Thunderstorm'
  return 'Unknown'
}
