import { getPreferences, setPreferences } from './db/prefs'
import { appVersion } from './version'
import { log } from './logger'
import {
  UPDATE_API_URL,
  UPDATE_RELEASES_URL,
  isNewerVersion,
  updateCheckDue,
  type UpdateStatus
} from '../shared/updates'

// The optional update check (Part 14 #11, finished in v0.3.0). Off by default.
// When on it asks GitHub's public releases endpoint, at most once a day,
// whether a newer version exists. The request carries the User-Agent
// `kaseki/<version>` and nothing else — exactly what the privacy policy
// describes. Nothing is downloaded and nothing installs itself: the result is
// shown in Settings → Updates with a link to the release page.

interface StoredUpdate {
  enabled: boolean
  latestVersion: string | null
  releaseUrl: string | null
  checkedAt: string | null
  error: string | null
}

function stored(): StoredUpdate {
  const raw = getPreferences().updates
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
  return {
    enabled: o.enabled === true,
    latestVersion: str(o.latestVersion),
    releaseUrl: str(o.releaseUrl),
    checkedAt: str(o.checkedAt),
    error: str(o.error)
  }
}

export function updateStatus(): UpdateStatus {
  const s = stored()
  return {
    enabled: s.enabled,
    currentVersion: appVersion,
    latestVersion: s.latestVersion,
    updateAvailable: s.latestVersion ? isNewerVersion(s.latestVersion, appVersion) : false,
    releaseUrl: s.releaseUrl,
    checkedAt: s.checkedAt,
    error: s.error
  }
}

export function setUpdateCheckEnabled(enabled: boolean): UpdateStatus {
  setPreferences({ updates: { ...stored(), enabled } })
  return updateStatus()
}

// Reads the two fields we use from GitHub's "latest release" reply. A release
// URL is only accepted if it points at the project's own releases page, so a
// surprising reply can never put an arbitrary link behind the button.
export function parseLatestRelease(json: unknown): { version: string; url: string } | null {
  if (typeof json !== 'object' || json === null) return null
  const o = json as Record<string, unknown>
  if (typeof o.tag_name !== 'string' || !o.tag_name) return null
  return { version: o.tag_name.replace(/^v/, ''), url: releaseUrl(o.html_url) }
}

// Parsed rather than prefix-matched, so "…/releases/../../other/repo" (which a
// browser would normalise to another project) is refused too.
function releaseUrl(raw: unknown): string {
  if (typeof raw !== 'string') return UPDATE_RELEASES_URL
  try {
    const url = new URL(raw)
    const base = new URL(UPDATE_RELEASES_URL)
    if (url.origin === base.origin && url.pathname.startsWith(`${base.pathname}/`)) return url.toString()
  } catch {
    // fall through
  }
  return UPDATE_RELEASES_URL
}

// Runs a check now. Refuses unless the feature is on — the only caller that
// can reach the network without the daily timer is the "Check now" button,
// which is disabled while the toggle is off.
export async function checkForUpdate(): Promise<UpdateStatus> {
  const s = stored()
  if (!s.enabled) return updateStatus()
  const checkedAt = new Date().toISOString()
  try {
    const response = await fetch(UPDATE_API_URL, {
      headers: { 'User-Agent': `kaseki/${appVersion}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10000)
    })
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
    const latest = parseLatestRelease(await response.json())
    if (!latest) throw new Error('Unexpected reply from GitHub')
    // Re-read before writing: the toggle may have been switched off while the
    // request was in flight, and that choice must not be overwritten.
    setPreferences({
      updates: { ...stored(), latestVersion: latest.version, releaseUrl: latest.url, checkedAt, error: null }
    })
  } catch (error) {
    log.warn('Update check failed', String(error))
    setPreferences({ updates: { ...stored(), checkedAt, error: 'Could not reach GitHub.' } })
  }
  return updateStatus()
}

// Called from the background tick: checks only when on and a day has passed.
export async function checkForUpdateIfDue(now: Date = new Date()): Promise<void> {
  const s = stored()
  if (updateCheckDue(s.enabled, s.checkedAt, now)) await checkForUpdate()
}
