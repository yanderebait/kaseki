// The update check and in-app updater (Part 14 #11; on by default since
// v0.3.2). Once per launch, right after the database is unlocked, Kaseki asks
// GitHub whether a newer release exists. If one does, a small prompt offers
// "Update now" or "Later". Nothing is downloaded until the user clicks. The
// pure parts live here so the self-test suite can pin them.

// The one place the release source is named.
export const UPDATE_REPO = 'yanderebait/kaseki'
export const UPDATE_API_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`
export const UPDATE_RELEASES_URL = `https://github.com/${UPDATE_REPO}/releases`

// 'install': the app can download and run the installer itself (a packaged
// Windows build). 'browser': it can only open the release page (a dev or
// source build, or a platform without an in-app installer).
export type UpdateInstallMode = 'install' | 'browser'

export type UpdateDownloadState = 'idle' | 'downloading' | 'ready' | 'error'

export interface UpdateDownload {
  state: UpdateDownloadState
  /** 0–100 while downloading. */
  percent: number
  error: string | null
}

export interface UpdateStatus {
  enabled: boolean
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string | null
  checkedAt: string | null
  error: string | null
  installMode: UpdateInstallMode
  download: UpdateDownload
}

// The stored preference is read as "on unless explicitly off": an unset or
// malformed value means on, and only a stored `enabled: false` turns it off.
// Through 0.3.1 the check was off by default and only `true` meant on.
export function updateCheckEnabled(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return true
  return (raw as Record<string, unknown>).enabled !== false
}

// The launch check runs at most once per app launch, and only once the
// database is unlocked (the preference lives inside it) and the check is on.
export function launchCheckDue(input: { unlocked: boolean; enabled: boolean; alreadyRan: boolean }): boolean {
  return input.unlocked && input.enabled && !input.alreadyRan
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
