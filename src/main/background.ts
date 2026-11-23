import { getAuthStatus } from './db/connection'
import { notificationTick } from './notifications'
import { runScheduledBackup } from './backup'
import { log } from './logger'

// The app's one background timer (v0.3.0). Once a minute, while the database
// is unlocked, it gives each scheduled feature a chance to run: event
// reminders and the daily summary, and a scheduled backup. Both are off until
// the user turns them on, and each decides for itself whether anything is due
// — so with both off, a tick reads two preferences and does nothing else.
// Nothing here touches the network. (The update check ran here daily through
// 0.3.1; since 0.3.2 it runs once per launch, after unlock — see updates.ts.)

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
