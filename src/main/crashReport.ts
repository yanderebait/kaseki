import { app } from 'electron'
import { randomBytes } from 'node:crypto'
import { homedir, release as osRelease } from 'node:os'
import { getPreferences } from './db/prefs'
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

export function crashConfig(): CrashConfig {
  const raw = getPreferences().crashReporting
  if (raw && typeof raw === 'object') {
    const c = raw as Record<string, unknown>
    return { enabled: c.enabled === true, dsn: typeof c.dsn === 'string' ? c.dsn : '' }
  }
  return { enabled: false, dsn: '' }
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

export function reportError(value: unknown, source: 'main' | 'renderer'): void {
  const cfg = crashConfig()
  if (!cfg.enabled || !cfg.dsn) return
  const dsn = parseDsn(cfg.dsn)
  if (!dsn) return
  void send(dsn, buildEvent(value, source))
}

// Installed once at startup. Reporting is gated inside reportError, so the
// handlers are harmless when the feature is off (they only add logging).
export function installCrashHandlers(): void {
  process.on('uncaughtException', (err) => {
    log.error('Uncaught exception', err)
    reportError(err, 'main')
  })
  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection', reason)
    reportError(reason, 'main')
  })
  app.on('render-process-gone', (_event, _wc, details) => {
    log.error('Render process gone', details)
    reportError(new Error(`Renderer process gone: ${details.reason}`), 'renderer')
  })
}
