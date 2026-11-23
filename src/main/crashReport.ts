import { app, dialog } from 'electron'
import { randomBytes } from 'node:crypto'
import { homedir, release as osRelease } from 'node:os'
import { getPreferences } from './db/prefs'
import { getAuthStatus } from './db/connection'
import { paths } from './paths'
import { appVersion } from './version'
import { log } from './logger'

// Opt-in crash reporting (Part 2 / Part 14 #12). Off by default; when the user
// enables it and supplies their own Sentry DSN, sanitised crash reports are
// sent to *their* instance. No SDK dependency — we parse the DSN and POST a
// minimal Sentry event ourselves. Nothing is sent unless both the toggle and a
// DSN are set, and only the fields previewed in "what would be sent" are
// included: app/OS versions, the error type/message/stack. Never task content,
// notes, file contents, names, or absolute paths.

interface CrashConfig {
  enabled: boolean
  dsn: string
}

// The setting lives in the encrypted database, so while it is locked (the
// password screen, or before it exists) reporting is simply off. This must
// never throw: it runs inside the process-level error handlers, and an error
// thrown there kills the app (0.3.2 died this way on every launch).
export function crashConfig(): CrashConfig {
  const off = { enabled: false, dsn: '' }
  if (getAuthStatus() !== 'unlocked') return off
  try {
    const raw = getPreferences().crashReporting
    if (raw && typeof raw === 'object') {
      const c = raw as Record<string, unknown>
      return { enabled: c.enabled === true, dsn: typeof c.dsn === 'string' ? c.dsn : '' }
    }
  } catch {
    // fall through: unreadable settings mean reporting is off
  }
  return off
}

// Strip the user's home directory and the Kaseki data dir from any string, so
// stack-trace paths can't leak a username or layout.
function scrub(text: string): string {
  if (!text) return text
  let out = text
  try {
    out = out.split(homedir()).join('~')
    out = out.split(paths.root).join('<data>')
  } catch {
    // ignore — best effort
  }
  return out
}

interface SentryDsn {
  storeUrl: string
  key: string
}

export function parseDsn(dsn: string): SentryDsn | null {
  try {
    const u = new URL(dsn.trim())
    const key = u.username
    const segments = u.pathname.split('/').filter(Boolean)
    const projectId = segments.pop()
    if (!key || !projectId) return null
    const prefix = segments.length ? `/${segments.join('/')}` : ''
    return { storeUrl: `${u.protocol}//${u.host}${prefix}/api/${projectId}/store/`, key }
  } catch {
    return null
  }
}

function toError(value: unknown): { type: string; message: string; stack: string } {
  if (value instanceof Error) {
    return { type: value.name || 'Error', message: value.message, stack: value.stack ?? '' }
  }
  return { type: 'NonError', message: String(value), stack: '' }
}

// The exact payload that gets sent — used both to send and to preview.
export function buildEvent(value: unknown, source: 'main' | 'renderer'): Record<string, unknown> {
  const err = toError(value)
  return {
    event_id: randomBytes(16).toString('hex'),
    timestamp: new Date().toISOString(),
    platform: 'node',
    level: 'error',
    release: `kaseki@${appVersion}`,
    environment: 'production',
    exception: { values: [{ type: err.type, value: scrub(err.message) }] },
    extra: { stack: scrub(err.stack) },
    contexts: {
      os: { name: process.platform, version: osRelease() },
      runtime: { name: 'electron', version: process.versions.electron }
    },
    tags: { process: source }
  }
}

// A sample event so the Settings preview shows real version/OS values and the
// exact shape, without sending anything.
export function sampleEvent(): Record<string, unknown> {
  const e = new Error('Example: a component failed to render')
  e.name = 'TypeError'
  return buildEvent(e, 'renderer')
}

async function send(dsn: SentryDsn, event: Record<string, unknown>): Promise<void> {
  try {
    await fetch(dsn.storeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=kaseki/${appVersion}`
      },
      body: JSON.stringify(event)
    })
  } catch {
    // Best effort — a failed report must never itself disrupt the app.
  }
}

// Never throws (it is called from the process-level error handlers).
export function reportError(value: unknown, source: 'main' | 'renderer'): void {
  try {
    const cfg = crashConfig()
    if (!cfg.enabled || !cfg.dsn) return
    const dsn = parseDsn(cfg.dsn)
    if (!dsn) return
    void send(dsn, buildEvent(value, source))
  } catch {
    // Best effort — reporting must never itself take the app down.
  }
}

// --- Startup failures --------------------------------------------------------
// Until the main window has been shown, any uncaught error means the user
// would otherwise be left with no window at all (and, on Windows, possibly a
// windowless process holding the single-instance lock, so every later launch
// exits silently). So before the window is shown, an error is fatal: it is
// logged, shown in an error dialog, and the process exits.

let windowShown = false
let failing = false

export function markWindowShown(): void {
  windowShown = true
}

export function startupFailed(error: unknown): void {
  if (failing) return
  failing = true
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
  try {
    log.error('Startup failed', error)
  } catch {
    // ignore: the dialog and exit below must still happen
  }
  process.stderr.write(`Kaseki failed to start: ${detail}\n`)
  // In the CI smoke run nobody is there to dismiss a dialog; the non-zero
  // exit and stderr are the signal.
  if (process.env.KASEKI_SMOKE !== '1') {
    try {
      dialog.showErrorBox(
        'Kaseki could not start',
        `Kaseki hit an error while starting and has to close.\n\n${scrub(detail)}\n\n` +
          `A log file with details is in ${paths.logs}.`
      )
    } catch {
      // ignore
    }
  }
  app.exit(1)
}

// Installed first thing at startup. Reporting is gated inside reportError, so
// the handlers are harmless when the feature is off (they only add logging).
export function installCrashHandlers(): void {
  const handle = (label: string, value: unknown): void => {
    try {
      log.error(label, value)
    } catch {
      // ignore
    }
    reportError(value, 'main')
    if (!windowShown) startupFailed(value)
  }
  process.on('uncaughtException', (err) => handle('Uncaught exception', err))
  process.on('unhandledRejection', (reason) => handle('Unhandled rejection', reason))
  app.on('render-process-gone', (_event, _wc, details) => {
    log.error('Render process gone', details)
    reportError(new Error(`Renderer process gone: ${details.reason}`), 'renderer')
    if (!windowShown) startupFailed(new Error(`The window's renderer process exited: ${details.reason}`))
  })
}
