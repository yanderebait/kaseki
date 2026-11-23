import { app, BrowserWindow } from 'electron'
import { getPreferences, setPreferences } from './db/prefs'
import { getAuthStatus } from './db/connection'
import { appVersion } from './version'
import { log } from './logger'
import {
  UPDATE_API_URL,
  UPDATE_RELEASES_URL,
  isNewerVersion,
  launchCheckDue,
  updateCheckEnabled,
  type UpdateDownload,
  type UpdateInstallMode,
  type UpdateStatus
} from '../shared/updates'

// The update check and in-app updater (Part 14 #11; on by default since
// v0.3.2). Once per launch, right after the database is unlocked, Kaseki asks
// GitHub's public releases endpoint whether a newer version exists. The request
// carries the User-Agent `kaseki/<version>` and nothing else — nothing from the
// database — exactly what the privacy policy describes. If a newer version
// exists the renderer offers "Update now"; only that click downloads anything.
//
// On a packaged Windows build the download and install go through
// electron-updater's GitHub provider: it reads the release's latest.yml,
// downloads the installer (with visible progress), checks it against the
// sha512 in latest.yml, and on "Restart to update" quits and runs it. Anywhere
// else (a dev or source build, Linux) the button opens the release page.

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
    enabled: updateCheckEnabled(raw),
    latestVersion: str(o.latestVersion),
    releaseUrl: str(o.releaseUrl),
    checkedAt: str(o.checkedAt),
    error: str(o.error)
  }
}

// --- Development-only simulation -------------------------------------------
// KASEKI_DEV_UPDATE=<version> makes the check report that version without any
// request; KASEKI_DEV_UPDATE_MODE=install additionally fakes the in-app
// download (progress, then "Restart to update", which only logs). Hard-gated
// on !isPackaged, like every other dev seam, so it is inert in a shipped build.
function devSimulatedVersion(): string | null {
  if (app.isPackaged) return null
  return process.env.KASEKI_DEV_UPDATE || null
}

function installMode(): UpdateInstallMode {
  if (devSimulatedVersion() && process.env.KASEKI_DEV_UPDATE_MODE === 'install') return 'install'
  // Only the NSIS installer can update itself in place; release.yml builds
  // nothing else, so every other platform gets the release page.
  return app.isPackaged && process.platform === 'win32' ? 'install' : 'browser'
}

let download: UpdateDownload = { state: 'idle', percent: 0, error: null }

export function updateStatus(): UpdateStatus {
  const s = stored()
  return {
    enabled: s.enabled,
    currentVersion: appVersion,
    latestVersion: s.latestVersion,
    updateAvailable: s.latestVersion ? isNewerVersion(s.latestVersion, appVersion) : false,
    releaseUrl: s.releaseUrl,
    checkedAt: s.checkedAt,
    error: s.error,
    installMode: installMode(),
    download: { ...download }
  }
}

// Pushes the current status to every window (the prompt and Settings listen).
function broadcast(): void {
  if (getAuthStatus() !== 'unlocked') return
  const status = updateStatus()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('updates:changed', status)
  }
}

export function setUpdateCheckEnabled(enabled: boolean): UpdateStatus {
  setPreferences({ updates: { ...stored(), enabled } })
  broadcast()
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

async function fetchLatest(): Promise<{ version: string; url: string }> {
  const simulated = devSimulatedVersion()
  if (simulated) return { version: simulated, url: `${UPDATE_RELEASES_URL}/tag/v${simulated}` }
  const response = await fetch(UPDATE_API_URL, {
    headers: { 'User-Agent': `kaseki/${appVersion}`, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(10000)
  })
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
  const latest = parseLatestRelease(await response.json())
  if (!latest) throw new Error('Unexpected reply from GitHub')
  return latest
}

// Runs a check now. Refuses while the check is switched off.
export async function checkForUpdate(): Promise<UpdateStatus> {
  if (!stored().enabled) return updateStatus()
  const checkedAt = new Date().toISOString()
  try {
    const latest = await fetchLatest()
    // Re-read before writing: the toggle may have been switched off while the
    // request was in flight, and that choice must not be overwritten.
    setPreferences({
      updates: { ...stored(), latestVersion: latest.version, releaseUrl: latest.url, checkedAt, error: null }
    })
  } catch (error) {
    log.warn('Update check failed', String(error))
    setPreferences({ updates: { ...stored(), checkedAt, error: 'Could not reach GitHub.' } })
  }
  broadcast()
  return updateStatus()
}

// The once-per-launch check, called right after the database is unlocked (or
// created). The flag is set before the request, so a lock/unlock cycle within
// the same launch never checks again.
let launchCheckRan = false

// Must only be called after a successful unlock or create (auth:unlock,
// auth:setup, the dev bootstrap). It still checks the lock itself and never
// throws: 0.3.2 called it at app start, where reading the preference from the
// still-locked database threw and killed the app before its window appeared.
export function runLaunchUpdateCheck(): void {
  try {
    const unlocked = getAuthStatus() === 'unlocked'
    const due = launchCheckDue({
      unlocked,
      // Only read the preference once unlocked: getPreferences() throws while
      // the database is locked.
      enabled: unlocked && stored().enabled,
      alreadyRan: launchCheckRan
    })
    if (!due) return
    launchCheckRan = true
    void checkForUpdate().catch((error) => log.warn('Update check failed', String(error)))
  } catch (error) {
    log.warn('Launch update check skipped', String(error))
  }
}

// --- Download and install (only after the user clicks "Update now") --------

type Updater = import('electron-updater').AppUpdater
let updater: Updater | null = null

// electron-updater is loaded on first use only, so nothing of it runs (and
// nothing is written to disk) unless the user asks for an update.
async function getUpdater(): Promise<Updater> {
  if (updater) return updater
  const { NsisUpdater } = await import('electron-updater')
  const u = new NsisUpdater()
  u.autoDownload = false
  u.autoInstallOnAppQuit = false
  u.autoRunAppAfterInstall = true
  u.allowPrerelease = false
  u.allowDowngrade = false
  u.requestHeaders = { 'User-Agent': `kaseki/${appVersion}` }
  u.logger = {
    info: (m?: unknown) => log.info('Updater', String(m)),
    warn: (m?: unknown) => log.warn('Updater', String(m)),
    error: (m?: unknown) => log.error('Updater', String(m)),
    debug: () => undefined
  }
  // electron-updater normally sends a random per-install id in an
  // `x-user-staging-id` header (and stores it in userData/.updaterId) for staged
  // rollouts. Kaseki uses no staged rollouts and sends no identifier: the id is
  // a constant that never touches disk, and the header is stripped. These are
  // private members, so they are patched on the instance.
  const patchable = u as unknown as {
    requestHeaders: Record<string, string> | null
    getOrCreateStagingUserId: () => Promise<string>
    computeFinalHeaders: (headers: Record<string, string>) => Record<string, string>
  }
  patchable.getOrCreateStagingUserId = async () => '00000000-0000-5000-8000-000000000000'
  patchable.computeFinalHeaders = (headers) => {
    delete headers['x-user-staging-id']
    return Object.assign(headers, patchable.requestHeaders ?? {})
  }
  u.on('download-progress', (p: { percent: number }) => {
    download = { state: 'downloading', percent: Math.max(0, Math.min(100, p.percent)), error: null }
    broadcast()
  })
  u.on('error', (error: Error) => log.warn('Updater error', String(error)))
  updater = u
  return u
}

function failDownload(error: unknown): void {
  log.warn('Update download failed', String(error))
  download = { state: 'error', percent: 0, error: 'The update could not be downloaded.' }
  broadcast()
}

async function devFakeDownload(): Promise<void> {
  for (let p = 0; p <= 100; p += 10) {
    download = { state: 'downloading', percent: p, error: null }
    broadcast()
    await new Promise((r) => setTimeout(r, Number(process.env.KASEKI_DEV_UPDATE_STEP_MS) || 400))
  }
}

// "Update now": downloads the installer named in the release's latest.yml and
// verifies it against the sha512 recorded there (electron-updater refuses a
// file whose hash does not match). Returns at once; progress arrives as
// `updates:changed` events.
export function downloadUpdate(): UpdateStatus {
  const status = updateStatus()
  if (status.installMode !== 'install' || !status.updateAvailable) return status
  if (download.state === 'downloading' || download.state === 'ready') return status
  download = { state: 'downloading', percent: 0, error: null }
  broadcast()
  void (async () => {
    try {
      if (devSimulatedVersion()) {
        await devFakeDownload()
      } else {
        const u = await getUpdater()
        const result = await u.checkForUpdates()
        if (!result || !result.isUpdateAvailable) throw new Error('No installable update in latest.yml')
        if (!isNewerVersion(result.updateInfo.version, appVersion)) {
          throw new Error(`latest.yml names ${result.updateInfo.version}, not a newer version`)
        }
        await u.downloadUpdate()
      }
      download = { state: 'ready', percent: 100, error: null }
      broadcast()
    } catch (error) {
      failDownload(error)
    }
  })()
  return updateStatus()
}

// "Restart to update": quits Kaseki and runs the verified installer silently,
// relaunching Kaseki when it finishes. The database closes on will-quit.
export function installUpdate(): void {
  if (download.state !== 'ready') return
  if (devSimulatedVersion()) {
    log.info('Dev update simulation: would quit and install now')
    return
  }
  if (!updater) return
  log.info('Quitting to install update')
  updater.quitAndInstall(true, true)
}
