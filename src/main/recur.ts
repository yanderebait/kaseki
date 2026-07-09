import { RRule } from 'rrule'

// Timezone-aware recurrence (v0.2.0). Events store their start/end as absolute
// UTC instants plus the IANA timezone they were created in (events.tz). A
// recurring event repeats at the same *wall-clock* time in that zone — a
// weekly 14:00 London call stays at 14:00 London on both sides of a DST
// change — rather than at a fixed UTC instant (the v0.1.0 behaviour, which
// drifted by an hour twice a year).
//
// rrule's tzid support is used for the expansion. Its contract (verified
// against rrule 2.8.1): dtstart/until are passed as "floating" Dates whose
// *UTC* fields carry the wall-clock components; occurrences come back as real
// UTC instants; between() takes real instants. All conversions between
// instants and wall clocks go through Intl, so any IANA zone works with no
// timezone database dependency.

export interface WallParts {
  y: number
  mo: number // 1-12
  d: number
  h: number
  mi: number
  s: number
}

const partFormatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = partFormatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    })
    partFormatters.set(tz, f)
  }
  return f
}

// The machine's current IANA zone — the default for new events and the
// backfill value for pre-0.2.0 rows.
export function machineTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

// True when Intl accepts the zone name; anything else falls back to the
// machine zone rather than crashing the expansion.
export function isValidTz(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0) return false
  try {
    formatterFor(tz)
    return true
  } catch {
    return false
  }
}

// Wall-clock components of a UTC instant in a zone.
export function wallParts(instant: Date, tz: string): WallParts {
  const parts = formatterFor(tz).formatToParts(instant)
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0)
  // Intl reports midnight as hour 24 in some ICU versions with h23; normalise.
  const h = get('hour')
  return { y: get('year'), mo: get('month'), d: get('day'), h: h === 24 ? 0 : h, mi: get('minute'), s: get('second') }
}

// A "floating" Date for rrule: the wall components of `instant` in `tz`,
// stored in the Date's UTC fields.
export function floatingFromInstant(instant: Date, tz: string): Date {
  const w = wallParts(instant, tz)
  return new Date(Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s))
}

// The UTC instant whose wall clock in `tz` shows the given components. Solved
// by guessing the components as UTC and correcting by the observed error —
// converges in one step for any fixed offset and two across a DST edge. For a
// nonexistent local time (spring-forward gap) this lands on the instant just
// after the gap; for an ambiguous time (fall-back) it picks one side
// deterministically. Both are the conventional resolutions.
export function instantFromWall(w: WallParts, tz: string): Date {
  let guess = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s)
  for (let i = 0; i < 3; i++) {
    const seen = wallParts(new Date(guess), tz)
    const errMs =
      Date.UTC(seen.y, seen.mo - 1, seen.d, seen.h, seen.mi, seen.s) -
      Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s)
    if (errMs === 0) break
    guess -= errMs
  }
  return new Date(guess)
}

export function floatingToInstant(floating: Date, tz: string): Date {
  return instantFromWall(
    {
      y: floating.getUTCFullYear(),
      mo: floating.getUTCMonth() + 1,
      d: floating.getUTCDate(),
      h: floating.getUTCHours(),
      mi: floating.getUTCMinutes(),
      s: floating.getUTCSeconds()
    },
    tz
  )
}

// Builds the RRule for a stored event: `ruleString` is the bare RRULE value
// as stored in events.recurrence_rule (any UNTIL in it is wall time in `tz` —
// see capRuleBefore), `startISO` the master's UTC start instant.
//
// Deliberately NO `tzid`. rrule's tzid mode converts through the *machine's*
// local timezone and returns different instants on different machines —
// verified: the same weekly Europe/London rule yields 13:00Z occurrences on a
// UTC machine and 15:00Z on a Europe/Copenhagen machine. Instead the rule
// iterates purely in floating wall-time space (plain UTC-field arithmetic,
// identical everywhere), and occurrencesBetween converts floating ↔ instant
// itself via the Intl helpers above, which take an explicit zone and never
// consult the machine's.
export function buildRule(ruleString: string, startISO: string, tz: string): RRule {
  const opts = RRule.parseString(ruleString)
  opts.dtstart = floatingFromInstant(new Date(startISO), tz)
  // parseString reads an UNTIL literally into a Date; its UTC fields carry
  // the stored wall stamp, which is exactly the floating frame the iteration
  // runs in.
  return new RRule(opts)
}

// One hour more than the largest UTC offset in either direction — floating
// bounds padded by this always cover every instant in the requested range.
const FLOATING_PAD_MS = 15 * 3_600_000

// Occurrence start instants within [rangeStart, rangeEnd] (inclusive).
// Iterates in floating space over padded bounds, converts each hit to a real
// instant in `tz`, and filters against the actual instant range — so the
// result is exact and independent of the machine's timezone.
export function occurrencesBetween(
  ruleString: string,
  startISO: string,
  tz: string,
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  const rule = buildRule(ruleString, startISO, tz)
  const floatStart = new Date(floatingFromInstant(rangeStart, tz).getTime() - FLOATING_PAD_MS)
  const floatEnd = new Date(floatingFromInstant(rangeEnd, tz).getTime() + FLOATING_PAD_MS)
  const out: Date[] = []
  for (const floating of rule.between(floatStart, floatEnd, true)) {
    const instant = floatingToInstant(floating, tz)
    if (instant >= rangeStart && instant <= rangeEnd) out.push(instant)
  }
  return out
}

// Returns `ruleString` capped so the series produces nothing at or after the
// `beforeISO` instant, preserving every other component (FREQ, INTERVAL,
// COUNT, BYxxx). The UNTIL is written as wall time in `tz`, matching how
// buildRule reads it back.
export function capRuleBefore(ruleString: string, tz: string, beforeISO: string): string {
  const opts = RRule.parseString(ruleString)
  opts.until = floatingFromInstant(new Date(new Date(beforeISO).getTime() - 1000), tz)
  // A rule may not carry both COUNT and UNTIL (RFC 5545); UNTIL now expresses
  // the cap, so drop COUNT if present.
  opts.count = null
  const serialized = RRule.optionsToString(opts)
  return serialized.slice(serialized.lastIndexOf('RRULE:') + 'RRULE:'.length)
}

// Shifts an exception child's slot key when a series master's start moves.
// The shift is applied in *wall time*: if the master moved from 14:00 to
// 14:30, every slot moves +30 wall minutes, whatever the UTC offset happens
// to be on that date.
export function shiftInstantByWallDelta(
  instantISO: string,
  tz: string,
  oldStartISO: string,
  newStartISO: string
): string {
  const oldFloat = floatingFromInstant(new Date(oldStartISO), tz).getTime()
  const newFloat = floatingFromInstant(new Date(newStartISO), tz).getTime()
  const deltaMs = newFloat - oldFloat
  const shiftedFloating = new Date(floatingFromInstant(new Date(instantISO), tz).getTime() + deltaMs)
  return floatingToInstant(shiftedFloating, tz).toISOString()
}

// RFC 5545 basic format of an instant's wall time in `tz` (for
// DTSTART;TZID=… lines in ICS export).
export function icsWallStamp(instantISO: string, tz: string): string {
  const w = wallParts(new Date(instantISO), tz)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${w.y}${p(w.mo)}${p(w.d)}T${p(w.h)}${p(w.mi)}${p(w.s)}`
}

// Converts a stored (wall-time) UNTIL inside a rule string to the UTC form
// RFC 5545 requires when the DTSTART carries a TZID — used only at ICS export.
export function ruleForIcsExport(ruleString: string, tz: string): string {
  const m = /UNTIL=(\d{8}T\d{6})Z?/.exec(ruleString)
  if (!m) return ruleString
  const [, stamp] = m
  const w: WallParts = {
    y: Number(stamp.slice(0, 4)),
    mo: Number(stamp.slice(4, 6)),
    d: Number(stamp.slice(6, 8)),
    h: Number(stamp.slice(9, 11)),
    mi: Number(stamp.slice(11, 13)),
    s: Number(stamp.slice(13, 15))
  }
  const utc = instantFromWall(w, tz)
  const p = (n: number): string => String(n).padStart(2, '0')
  const utcStamp =
    `${utc.getUTCFullYear()}${p(utc.getUTCMonth() + 1)}${p(utc.getUTCDate())}` +
    `T${p(utc.getUTCHours())}${p(utc.getUTCMinutes())}${p(utc.getUTCSeconds())}Z`
  return ruleString.replace(m[0], `UNTIL=${utcStamp}`)
}
