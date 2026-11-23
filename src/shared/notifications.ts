// Desktop notifications (Part 14 #9, finished in v0.3.0). Off by default.
// When on, the main process raises an OS notification shortly before a timed
// event starts, and optionally one summary a day of what is due and overdue.
// Nothing leaves the machine: these are local OS notifications, built from
// the local database. The selection logic is pure and lives here so the
// self-test suite can pin it.

export interface NotificationConfig {
  enabled: boolean
  eventLeadMinutes: number // how long before an event starts to remind
  dailyDigest: boolean // one "due today / overdue" summary per day
  digestHour: number // local hour (0–23) at or after which the summary is sent
}

export const DEFAULT_NOTIFICATIONS: NotificationConfig = {
  enabled: false,
  eventLeadMinutes: 15,
  dailyDigest: true,
  digestHour: 9
}

export const LEAD_OPTIONS = [5, 10, 15, 30, 60]

export function normalizeNotificationConfig(raw: unknown): NotificationConfig {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_NOTIFICATIONS }
  const o = raw as Record<string, unknown>
  const lead =
    typeof o.eventLeadMinutes === 'number' && o.eventLeadMinutes >= 1 && o.eventLeadMinutes <= 1440
      ? Math.round(o.eventLeadMinutes)
      : DEFAULT_NOTIFICATIONS.eventLeadMinutes
  const hour =
    typeof o.digestHour === 'number' && o.digestHour >= 0 && o.digestHour <= 23
      ? Math.floor(o.digestHour)
      : DEFAULT_NOTIFICATIONS.digestHour
  return {
    enabled: o.enabled === true,
    eventLeadMinutes: lead,
    dailyDigest: o.dailyDigest !== false,
    digestHour: hour
  }
}

export interface ReminderCandidate {
  masterId: number
  occurrenceStart: string
  title: string
  allDay: boolean
  completed: boolean
  location: string | null
}

export function reminderKey(c: { masterId: number; occurrenceStart: string }): string {
  return `${c.masterId}|${c.occurrenceStart}`
}

// The occurrences that should raise a reminder right now: timed, not marked
// complete, starting within the lead window (start − lead ≤ now < start), and
// not already reminded this session. All-day events have no start moment to
// count down to, so they are left to the daily summary.
export function dueReminders(
  candidates: ReminderCandidate[],
  now: Date,
  leadMinutes: number,
  alreadySent: ReadonlySet<string>
): ReminderCandidate[] {
  const nowMs = now.getTime()
  const leadMs = leadMinutes * 60000
  return candidates.filter((c) => {
    if (c.allDay || c.completed) return false
    const start = new Date(c.occurrenceStart).getTime()
    if (Number.isNaN(start)) return false
    if (nowMs >= start || nowMs < start - leadMs) return false
    return !alreadySent.has(reminderKey(c))
  })
}

// "in 15 min" / "in 1 min" / "now" — the reminder's subtitle.
export function reminderLead(occurrenceStart: string, now: Date): string {
  const minutes = Math.round((new Date(occurrenceStart).getTime() - now.getTime()) / 60000)
  return minutes <= 0 ? 'now' : `in ${minutes} min`
}

// The local calendar date, 'YYYY-MM-DD' — the unit the daily summary dedupes on.
export function localDateKey(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// The summary is due once per local day, at or after the configured hour.
export function digestDue(config: NotificationConfig, lastDigestDate: string | null, now: Date): boolean {
  if (!config.enabled || !config.dailyDigest) return false
  if (now.getHours() < config.digestHour) return false
  return lastDigestDate !== localDateKey(now)
}

// The summary's body, or null when there is nothing to say (no notification
// is raised for an empty day).
export function digestBody(dueToday: number, overdue: number): string | null {
  if (dueToday === 0 && overdue === 0) return null
  const parts: string[] = []
  if (dueToday > 0) parts.push(`${dueToday} task${dueToday === 1 ? '' : 's'} due today`)
  if (overdue > 0) parts.push(`${overdue} overdue`)
  return parts.join(', ')
}
