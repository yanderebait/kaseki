import { appendFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from './paths'

type Level = 'info' | 'warn' | 'error'

function write(level: Level, message: string, detail?: unknown): void {
  const timestamp = new Date().toISOString()
  const suffix = detail !== undefined ? ` ${safeStringify(detail)}` : ''
  const line = `${timestamp} [${level.toUpperCase()}] ${message}${suffix}\n`
  try {
    appendFileSync(join(paths.logs, `kaseki-${timestamp.slice(0, 10)}.log`), line)
  } catch {
    // Logging must never take the app down; fall through to console only.
  }
  if (!process.env.ELECTRON_RENDERER_URL) return
  // eslint-disable-next-line no-console
  console[level === 'info' ? 'log' : level](line.trimEnd())
}

function safeStringify(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export const log = {
  info: (message: string, detail?: unknown) => write('info', message, detail),
  warn: (message: string, detail?: unknown) => write('warn', message, detail),
  error: (message: string, detail?: unknown) => write('error', message, detail)
}

// Deletes daily log files older than 30 days. One file per day was written
// forever in 0.1.0. Called once at startup; failures are swallowed — log
// hygiene must never take the app down.
export function pruneOldLogs(maxAgeDays = 30): void {
  try {
    const cutoff = Date.now() - maxAgeDays * 86_400_000
    for (const name of readdirSync(paths.logs)) {
      const m = /^kaseki-(\d{4}-\d{2}-\d{2})\.log$/.exec(name)
      if (!m) continue
      if (Date.parse(m[1] + 'T00:00:00Z') < cutoff) {
        rmSync(join(paths.logs, name), { force: true })
      }
    }
  } catch {
    // best-effort
  }
}
