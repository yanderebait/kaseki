// The optional update check (Part 14 #11, finished in v0.3.0). Off by default.
// When on, Kaseki asks GitHub at most once a day whether a newer release
// exists. It never downloads or installs anything: it tells you, and you
// decide. The pure parts live here so the self-test suite can pin them.

// The one place the release source is named.
export const UPDATE_REPO = 'yanderebait/kaseki'
export const UPDATE_API_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`
export const UPDATE_RELEASES_URL = `https://github.com/${UPDATE_REPO}/releases`

export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface UpdateStatus {
  enabled: boolean
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string | null
  checkedAt: string | null
  error: string | null
}

// "v0.3.0" / "0.3.0-beta.1" → [0, 3, 0]. Returns null for anything that isn't
// a dotted numeric version ('dev', an empty string), so a source build never
// claims an update is available.
export function parseVersion(version: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}

// A check is due when the feature is on and the last one is missing or older
// than a day. A last-checked time in the future (clock changed) also counts as
// due rather than silencing the check indefinitely.
export function updateCheckDue(enabled: boolean, checkedAt: string | null, now: Date): boolean {
  if (!enabled) return false
  if (!checkedAt) return true
  const last = new Date(checkedAt).getTime()
  if (Number.isNaN(last)) return true
  const age = now.getTime() - last
  return age < 0 || age >= UPDATE_CHECK_INTERVAL_MS
}
