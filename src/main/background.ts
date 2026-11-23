import { getAuthStatus } from './db/connection'
import { notificationTick } from './notifications'
import { runScheduledBackup } from './backup'
import { checkForUpdateIfDue } from './updates'
import { log } from './logger'

// The app's one background timer (v0.3.0). Once a minute, while the database
// is unlocked, it gives each scheduled feature a chance to run: event
// reminders and the daily summary, a scheduled backup, and the daily update
// check. Every one of those is off until the user turns it on, and each
// decides for itself whether anything is due — so with everything off, a tick
// reads three preferences and does nothing else. Nothing here touches the
// network unless the update check is enabled.

const TICK_MS = 60 * 1000

let timer: NodeJS.Timeout | null = null

export function backgroundTick(now: Date = new Date()): void {
  if (getAuthStatus() !== 'unlocked') return
  notificationTick(now)
  try {
    runScheduledBackup(now)
  } catch (error) {
    log.error('Scheduled backup failed', error)
  }
  void checkForUpdateIfDue(now).catch((error) => log.warn('Update check failed', String(error)))
}

export function startBackgroundTasks(): void {
  if (timer) return
  timer = setInterval(() => backgroundTick(), TICK_MS)
  // The timer must never keep the process alive after the last window closes.
  timer.unref()
}

export function stopBackgroundTasks(): void {
  if (timer) clearInterval(timer)
  timer = null
}
