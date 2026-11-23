import { getPreferences } from './db/prefs'
import { appVersion } from './version'
import { log } from './logger'
import {
  normalizeWeatherConfig,
  weatherReady,
  type WeatherConfig,
  type WeatherDay,
  type WeatherPlace,
  type WeatherReport,
  type WeatherResult
} from '../shared/widgets'

// The Weather widget's network side (Part 14 #13, finished in v0.3.0). This is
// one of Kaseki's three optional outbound features and it follows the same
// rules as the other two: off by default, nothing sent until the user turns it
// on AND picks a location, and the request carries only what the privacy
// policy says it does — the configured coordinates (or, for the one-off
// location search, the place name typed) and the preferred units. No account,
// no API key, no identifier, nothing from the database.
//
// The renderer is sandboxed with no network access of its own; it asks the
// main process, which is the only place a request can be made.

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'

// A forecast is reused for half an hour, so opening the home screen repeatedly
// doesn't mean a request each time.
export const WEATHER_CACHE_MS = 30 * 60 * 1000
const REQUEST_TIMEOUT_MS = 10000

export function weatherConfig(): WeatherConfig {
  return normalizeWeatherConfig(getPreferences().weather)
}

export function forecastUrl(config: WeatherConfig): string {
  const params = new URLSearchParams({
    latitude: String(config.latitude),
    longitude: String(config.longitude),
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '4'
  })
  if (config.units === 'fahrenheit') params.set('temperature_unit', 'fahrenheit')
  return `${FORECAST_URL}?${params.toString()}`
}

export function geocodeUrl(query: string): string {
  const params = new URLSearchParams({ name: query, count: '6', language: 'en', format: 'json' })
  return `${GEOCODE_URL}?${params.toString()}`
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// Turns the provider's JSON into the widget's shape, or null if it isn't the
// response we asked for. Parsing is separate from fetching so it can be tested
// without a network.
export function parseForecast(json: unknown, config: WeatherConfig, now: Date): WeatherReport | null {
  if (typeof json !== 'object' || json === null) return null
  const o = json as Record<string, unknown>
  const current = o.current as Record<string, unknown> | undefined
  const daily = o.daily as Record<string, unknown> | undefined
  if (!current || !daily) return null
  const temperature = num(current.temperature_2m)
  const code = num(current.weather_code)
  if (temperature === null || code === null) return null

  const dates = Array.isArray(daily.time) ? daily.time : []
  const codes = Array.isArray(daily.weather_code) ? daily.weather_code : []
  const highs = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : []
  const lows = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : []
  const days: WeatherDay[] = []
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]
    const high = num(highs[i])
    const low = num(lows[i])
    const dayCode = num(codes[i])
    if (typeof date !== 'string' || high === null || low === null || dayCode === null) continue
    days.push({ date, code: dayCode, high, low })
  }

  return {
    place: config.name,
    units: config.units,
    temperature,
    code,
    days,
    fetchedAt: now.toISOString()
  }
}

export function parsePlaces(json: unknown): WeatherPlace[] {
  if (typeof json !== 'object' || json === null) return []
  const results = (json as Record<string, unknown>).results
  if (!Array.isArray(results)) return []
  const out: WeatherPlace[] = []
  for (const r of results) {
    if (typeof r !== 'object' || r === null) continue
    const o = r as Record<string, unknown>
    const latitude = num(o.latitude)
    const longitude = num(o.longitude)
    if (typeof o.name !== 'string' || latitude === null || longitude === null) continue
    const region = [o.admin1, o.country].filter((p): p is string => typeof p === 'string' && !!p)
    out.push({ name: o.name, region: region.join(', '), latitude, longitude })
  }
  return out
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { 'User-Agent': `kaseki/${appVersion}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!response.ok) throw new Error(`Weather provider answered ${response.status}`)
  return response.json()
}

let cache: { key: string; at: number; report: WeatherReport } | null = null

function cacheKey(config: WeatherConfig): string {
  return `${config.latitude},${config.longitude},${config.units}`
}

export function clearWeatherCache(): void {
  cache = null
}

export async function getWeather(force = false): Promise<WeatherResult> {
  const config = weatherConfig()
  if (!config.enabled) return { status: 'off' }
  if (!weatherReady(config)) return { status: 'unset' }

  const key = cacheKey(config)
  const now = Date.now()
  if (!force && cache && cache.key === key && now - cache.at < WEATHER_CACHE_MS) {
    return { status: 'ok', report: cache.report }
  }
  try {
    const report = parseForecast(await getJson(forecastUrl(config)), config, new Date(now))
    if (!report) return { status: 'error', message: 'The weather provider sent an unexpected reply.' }
    cache = { key, at: now, report }
    return { status: 'ok', report }
  } catch (error) {
    log.warn('Weather fetch failed', String(error))
    // A stale forecast for the same place beats an error card.
    if (cache && cache.key === key) return { status: 'ok', report: cache.report }
    return { status: 'error', message: 'Could not reach the weather provider.' }
  }
}

// The location search in Settings. Only runs when the user presses Search with
// the weather feature switched on; sends the typed place name and nothing else.
export async function searchPlaces(query: string): Promise<WeatherPlace[]> {
  const q = query.trim()
  if (q.length < 2 || !weatherConfig().enabled) return []
  try {
    return parsePlaces(await getJson(geocodeUrl(q)))
  } catch (error) {
    log.warn('Weather place search failed', String(error))
    return []
  }
}
