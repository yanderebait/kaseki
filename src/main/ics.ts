import { getDb } from './db/connection'
import { icsWallStamp, isValidTz, machineTz, ruleForIcsExport } from './recur'

// A master event plus its exceptions, shaped for ICS emission. Times are UTC
// ISO strings as stored; the builder formats them per RFC 5545. Recurring
// events additionally carry their IANA timezone: they must be exported as
// wall time with a TZID (DTSTART;TZID=Europe/London:20260603T140000), because
// an RRULE over a bare UTC DTSTART would make every consumer re-expand at a
// fixed instant and reintroduce the DST drift this release removes.
export interface IcsOverride {
  recurrenceId: string
  title: string
  description: string | null
  start: string
  end: string | null
  allDay: boolean
  location: string | null
}

export interface IcsEvent {
  id: number
  title: string
  description: string | null
  start: string
  end: string | null
  allDay: boolean
  location: string | null
  recurrenceRule: string | null
  tz: string
  exdates: string[]
  overrides: IcsOverride[]
}

const pad = (n: number): string => String(n).padStart(2, '0')

// Timed values are absolute UTC (…Z); all-day values are a floating DATE in
// the local calendar day the event was created for.
function formatStamp(iso: string, allDay: boolean): string {
  const d = new Date(iso)
  if (allDay) {
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  }
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

// RFC 5545 TEXT escaping: backslash, semicolon, comma, and newlines.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n')
}

// Folds a content line to ≤75 octets, continuation lines prefixed with a
// space, without splitting a UTF-8 code point.
function fold(line: string): string {
  const out: string[] = []
  let current = ''
  let bytes = 0
  let limit = 75
  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch, 'utf8')
    if (bytes + chBytes > limit) {
      out.push(current)
      current = ' '
      bytes = 1
      limit = 75
    }
    current += ch
    bytes += chBytes
  }
  out.push(current)
  return out.join('\r\n')
}

function eventLines(
  uid: string,
  e: { title: string; description: string | null; start: string; end: string | null; allDay: boolean; location: string | null },
  dtstamp: string,
  extra: string[],
  tzid?: string
): string[] {
  // With a tzid, timed values are emitted as local wall time in that zone
  // (RFC 5545 §3.3.5 form 3); without one, as absolute UTC as before.
  const stamp = (iso: string): string =>
    e.allDay ? formatStamp(iso, true) : tzid ? icsWallStamp(iso, tzid) : formatStamp(iso, false)
  const dtProp = e.allDay ? 'DTSTART;VALUE=DATE' : tzid ? `DTSTART;TZID=${tzid}` : 'DTSTART'
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    ...extra,
    `${dtProp}:${stamp(e.start)}`
  ]
  if (e.end) {
    const endProp = e.allDay ? 'DTEND;VALUE=DATE' : tzid ? `DTEND;TZID=${tzid}` : 'DTEND'
    lines.push(`${endProp}:${stamp(e.end)}`)
  }
  lines.push(`SUMMARY:${escapeText(e.title)}`)
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`)
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`)
  lines.push('END:VEVENT')
  return lines
}

// Builds a complete VCALENDAR. Pure and deterministic given dtstamp, so the
// self-test can assert on the exact string shape.
export function buildIcs(events: IcsEvent[], calName: string, dtstamp: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kaseki//Calendar//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(calName)}`
  ]
  for (const e of events) {
    const uid = `kaseki-${e.id}@kaseki.local`
    // Recurring, timed events are exported in their own zone; one-offs and
    // all-day events keep the plain UTC / DATE forms.
    const tzid = e.recurrenceRule && !e.allDay ? e.tz : undefined
    const extra: string[] = []
    if (e.recurrenceRule) {
      // Stored UNTILs are wall time in the event's zone; RFC 5545 requires
      // UTC when the DTSTART carries a TZID, so convert at the boundary.
      extra.push(`RRULE:${tzid ? ruleForIcsExport(e.recurrenceRule, tzid) : e.recurrenceRule}`)
    }
    for (const ex of e.exdates) {
      extra.push(
        e.allDay
          ? `EXDATE;VALUE=DATE:${formatStamp(ex, true)}`
          : tzid
            ? `EXDATE;TZID=${tzid}:${icsWallStamp(ex, tzid)}`
            : `EXDATE:${formatStamp(ex, false)}`
      )
    }
    lines.push(...eventLines(uid, e, dtstamp, extra, tzid))
    // Overrides are linked instances: same UID, a RECURRENCE-ID naming the
    // slot they replace.
    for (const ov of e.overrides) {
      const recId = ov.allDay
        ? `RECURRENCE-ID;VALUE=DATE:${formatStamp(ov.recurrenceId, true)}`
        : tzid
          ? `RECURRENCE-ID;TZID=${tzid}:${icsWallStamp(ov.recurrenceId, tzid)}`
          : `RECURRENCE-ID:${formatStamp(ov.recurrenceId, false)}`
      lines.push(...eventLines(uid, ov, dtstamp, [recId], tzid))
    }
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

interface ExportRow {
  id: number
  space_id: number | null
  title: string
  description: string | null
  start_at: string
  end_at: string | null
  all_day: number
  location: string | null
  recurrence_rule: string | null
  recurrence_parent_id: number | null
  original_start_at: string | null
  cancelled: number
  tz: string | null
}

// Gathers masters (plus their exception children) for the whole calendar, or
// for one space plus Global events — mirroring expandEvents' filter.
export function gatherIcsEvents(spaceId?: number | null): IcsEvent[] {
  const db = getDb()
  const masters = (
    spaceId == null
      ? db.prepare('SELECT * FROM events WHERE recurrence_parent_id IS NULL ORDER BY start_at').all()
      : db
          .prepare(
            'SELECT * FROM events WHERE recurrence_parent_id IS NULL AND (space_id = ? OR space_id IS NULL) ORDER BY start_at'
          )
          .all(spaceId)
  ) as ExportRow[]

  const children = db
    .prepare('SELECT * FROM events WHERE recurrence_parent_id IS NOT NULL')
    .all() as ExportRow[]
  const byParent = new Map<number, ExportRow[]>()
  for (const c of children) {
    const arr = byParent.get(c.recurrence_parent_id as number) ?? []
    arr.push(c)
    byParent.set(c.recurrence_parent_id as number, arr)
  }

  return masters
    .filter((m) => !m.cancelled)
    .map((m) => {
      const kids = byParent.get(m.id) ?? []
      return {
        id: m.id,
        title: m.title,
        description: m.description,
        start: m.start_at,
        end: m.end_at,
        allDay: !!m.all_day,
        location: m.location,
        recurrenceRule: m.recurrence_rule,
        tz: isValidTz(m.tz) ? m.tz : machineTz(),
        exdates: kids.filter((k) => k.cancelled).map((k) => k.original_start_at as string),
        overrides: kids
          .filter((k) => !k.cancelled)
          .map((k) => ({
            recurrenceId: k.original_start_at as string,
            title: k.title,
            description: k.description,
            start: k.start_at,
            end: k.end_at,
            allDay: !!k.all_day,
            location: k.location
          }))
      }
    })
}

export function exportIcs(calName: string, dtstamp: string, spaceId?: number | null): string {
  return buildIcs(gatherIcsEvents(spaceId), calName, dtstamp)
}
