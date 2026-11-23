import { BrowserWindow, Notification } from 'electron'
import { getAuthStatus } from './db/connection'
import { getPreferences, setPreferences } from './db/prefs'
import { expandEvents } from './db/events'
import { dueCounts } from './db/upcoming'
import { log } from './logger'
import {
  digestBody,
  digestDue,
  dueReminders,
  localDateKey,
  normalizeNotificationConfig,
  reminderKey,
  reminderLead,
  type NotificationConfig
} from '../shared/notifications'

// Desktop notifications (Part 14 #9, finished in v0.3.0). Off by default. The
// decisions about *what* is due are pure (src/shared/notifications.ts); this
// module only reads the database, raises the OS notification, and remembers
// what it has already raised.

export function notificationConfig(): NotificationConfig {
  return normalizeNotificationConfig(getPreferences().notifications)
}

// Occurrences already reminded this session. A restart inside an event's lead
// window can remind once more; that is preferable to persisting a growing set.
const sent = new Set<string>()

function focusApp(): void {
  const [window] = BrowserWindow.getAllWindows()
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function raise(title: string, body: string): boolean {
  if (!Notification.isSupported()) return false
  try {
    const notification = new Notification({ title, body, silent: false })
    notification.on('click', focusApp)
    notification.show()
    return true
  } catch (error) {
    log.warn('Notification failed', String(error))
    return false
  }
}

// One pass of the reminder logic. Called every minute by the background tick;
// does nothing while the database is locked or notifications are off.
export function notificationTick(now: Date = new Date()): void {
  if (getAuthStatus() !== 'unlocked') return
  const config = notificationConfig()
  if (!config.enabled) return

  try {
    const windowEnd = new Date(now.getTime() + config.eventLeadMinutes * 60000)
    const due = dueReminders(
      expandEvents(now.toISOString(), windowEnd.toISOString()),
      now,
      config.eventLeadMinutes,
      sent
    )
    for (const occurrence of due) {
      sent.add(reminderKey(occurrence))
      const where = occurrence.location ? ` · ${occurrence.location}` : ''
      raise(occurrence.title, `Starts ${reminderLead(occurrence.occurrenceStart, now)}${where}`)
    }

    const last = getPreferences().notificationsLastDigest
    if (digestDue(config, typeof last === 'string' ? last : null, now)) {
      const { dueToday, overdue } = dueCounts(now)
      const body = digestBody(dueToday, overdue)
      if (body) raise('Kaseki — today', body)
      // Recorded even when there was nothing to say, so an empty morning
      // isn't re-evaluated (and a task added at noon doesn't trigger a
      // surprise "morning" summary at 12:01).
      setPreferences({ notificationsLastDigest: localDateKey(now) })
    }
  } catch (error) {
    log.error('Notification tick failed', error)
  }
}

// "Send a test notification" in Settings: proves the OS will show them.
export function sendTestNotification(): { ok: boolean; error?: string } {
  if (!Notification.isSupported()) {
    return { ok: false, error: 'This system does not support desktop notifications.' }
  }
  return raise('Kaseki', 'Notifications are working.')
    ? { ok: true }
    : { ok: false, error: 'The notification could not be shown.' }
}
