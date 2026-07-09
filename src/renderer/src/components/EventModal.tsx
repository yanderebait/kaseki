import { useEffect, useState } from 'react'
import Modal from './Modal'
import type { CalendarEvent, EventOccurrence, NewEvent, Space } from '../../../shared/types'

// Which slice of a recurring series an edit or delete applies to.
type Scope = 'this' | 'following' | 'all'

const RECURRENCE_PRESETS: { label: string; rule: string | null }[] = [
  { label: 'Does not repeat', rule: null },
  { label: 'Hourly', rule: 'FREQ=HOURLY' },
  { label: 'Every 6 hours', rule: 'FREQ=HOURLY;INTERVAL=6' },
  { label: 'Every 12 hours', rule: 'FREQ=HOURLY;INTERVAL=12' },
  { label: 'Daily', rule: 'FREQ=DAILY' },
  { label: 'Weekly', rule: 'FREQ=WEEKLY' },
  { label: 'Monthly', rule: 'FREQ=MONTHLY' },
  { label: 'Yearly', rule: 'FREQ=YEARLY' },
  { label: 'Custom…', rule: 'CUSTOM' }
]

const pad = (n: number): string => String(n).padStart(2, '0')

function isoToParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
}

function partsToIso(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = (time || '00:00').split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString()
}

function todayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Maps an existing rule back to the preset select + custom fields, keeping
// every component the UI doesn't expose (UNTIL, COUNT, BYxxx) as an opaque
// tail to re-emit on save. Dropping the tail — the 0.1.0 behaviour — meant
// that after "delete this and following" capped a series with UNTIL, the next
// ordinary edit stripped the cap and resurrected every deleted occurrence.
function ruleToState(rule: string | null): { preset: string; n: number; unit: string; tail: string } {
  if (!rule) return { preset: '', n: 1, unit: 'DAILY', tail: '' }
  const known = RECURRENCE_PRESETS.find((p) => p.rule === rule)
  if (known) return { preset: rule, n: 1, unit: 'DAILY', tail: '' }
  const freq = /FREQ=([A-Z]+)/.exec(rule)?.[1] ?? 'DAILY'
  const interval = Number(/INTERVAL=(\d+)/.exec(rule)?.[1] ?? '1')
  const tail = rule
    .split(';')
    .filter((part) => part && !/^FREQ=/.test(part) && !/^INTERVAL=/.test(part))
    .join(';')
  return { preset: 'CUSTOM', n: interval, unit: freq, tail: tail ? `;${tail}` : '' }
}

// Create or edit an event (Part 16). When `occurrence` names a slot of a
// recurring series, edits and deletes go through a Google-Calendar-style
// scope prompt (this / this and following / all); otherwise the whole event
// (the master row) is changed directly.
export default function EventModal({
  event,
  occurrence,
  defaultDate,
  defaultSpaceId,
  onClose,
  onSaved
}: {
  event?: CalendarEvent | null
  occurrence?: EventOccurrence
  defaultDate?: string
  defaultSpaceId?: number | null
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [spaces, setSpaces] = useState<Space[]>([])
  // A recurring occurrence seeds its fields from the concrete slot; everything
  // else seeds from the event (master) row. Recurrence itself always reflects
  // the master's rule.
  const perOccurrence = !!occurrence && occurrence.recurring
  const seed = perOccurrence ? occurrence : (event ?? undefined)
  const startISO = perOccurrence ? occurrence.occurrenceStart : event?.start
  const startParts = startISO ? isoToParts(startISO) : null
  const endISO = perOccurrence ? occurrence.end : (event?.end ?? null)
  const endParts = endISO ? isoToParts(endISO) : null
  const ruleState = ruleToState(event?.recurrenceRule ?? null)

  const [title, setTitle] = useState(seed?.title ?? '')
  const [date, setDate] = useState(startParts?.date ?? defaultDate ?? todayDate())
  const [allDay, setAllDay] = useState(seed?.allDay ?? false)
  const [startTime, setStartTime] = useState(startParts?.time ?? '09:00')
  const [endTime, setEndTime] = useState(endParts?.time ?? '10:00')
  const [location, setLocation] = useState(seed?.location ?? '')
  const [description, setDescription] = useState(seed?.description ?? '')
  const [spaceId, setSpaceId] = useState<number | null>(seed?.spaceId ?? defaultSpaceId ?? null)
  const [preset, setPreset] = useState(ruleState.preset)
  const [customN, setCustomN] = useState(ruleState.n)
  const [customUnit, setCustomUnit] = useState(ruleState.unit)
  const [busy, setBusy] = useState(false)
  // Non-null while the scope prompt for a recurring edit/delete is showing.
  const [pendingScope, setPendingScope] = useState<'save' | 'delete' | null>(null)

  useEffect(() => {
    window.kaseki.spaces.list().then(setSpaces)
  }, [])

  function recurrenceRule(): string | null {
    if (preset === '') return null
    // The preserved tail (UNTIL / COUNT / BYxxx) rides along with any custom
    // rule so the series cap set by "delete this and following" survives
    // later edits.
    if (preset === 'CUSTOM') return `FREQ=${customUnit};INTERVAL=${Math.max(1, customN)}${ruleState.tail}`
    return preset
  }

  // True when the chosen end wall-time is at or before the start — an
  // overnight session (22:00–01:00), which ends on the next calendar day.
  const rollsOvernight = !allDay && endTime <= startTime

  function nextDate(d: string): string {
    const [y, m, dd] = d.split('-').map(Number)
    const n = new Date(y, m - 1, dd + 1)
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`
  }

  // The form's values as a NewEvent, anchored to a given local date. Per-
  // occurrence saves anchor to the edited slot's date; whole-series saves
  // ("all") anchor to the master's own date so the cadence stays put. An end
  // time at or before the start rolls to the next day (a 22:00–01:00 block
  // previously stored end-before-start and rendered with negative duration);
  // the event carries the machine's IANA zone so recurrence stays on the
  // wall clock across DST.
  function buildEvent(anchorDate = date): NewEvent {
    const endAnchor = rollsOvernight ? nextDate(anchorDate) : anchorDate
    return {
      spaceId,
      title: title.trim(),
      description: description.trim() || null,
      start: allDay ? partsToIso(anchorDate, '00:00') : partsToIso(anchorDate, startTime),
      end: allDay ? null : partsToIso(endAnchor, endTime),
      allDay,
      location: location.trim() || null,
      recurrenceRule: recurrenceRule(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    }
  }

  function done(): void {
    onSaved()
    onClose()
  }

  async function save(): Promise<void> {
    if (title.trim().length === 0 || busy) return
    if (perOccurrence) {
      setPendingScope('save')
      return
    }
    setBusy(true)
    try {
      if (event) await window.kaseki.events.update(event.id, buildEvent())
      else await window.kaseki.events.create(buildEvent())
    } finally {
      setBusy(false)
    }
    done()
  }

  async function remove(): Promise<void> {
    if (busy) return
    if (perOccurrence) {
      setPendingScope('delete')
      return
    }
    setBusy(true)
    try {
      if (event) await window.kaseki.events.delete(event.id)
    } finally {
      setBusy(false)
    }
    done()
  }

  // Applies a recurring edit or delete to the chosen slice of the series.
  async function applyScope(scope: Scope): Promise<void> {
    if (!occurrence || !event || busy) return
    setBusy(true)
    const masterId = event.id
    const from = occurrence.originalStart
    const e = window.kaseki.events
    if (pendingScope === 'delete') {
      if (scope === 'this') await e.cancelOccurrence(masterId, from)
      else if (scope === 'following') await e.truncateSeries(masterId, from)
      else await e.delete(masterId)
    } else {
      if (scope === 'this') await e.setOverride(masterId, from, buildEvent())
      else if (scope === 'following') await e.splitSeries(masterId, from, buildEvent())
      else await e.update(masterId, buildEvent(isoToParts(event.start).date))
    }
    setBusy(false)
    done()
  }

  return (
    <Modal title={event ? 'Edit event' : 'New event'} onClose={onClose}>
      <div className="form-stack event-form">
        <input
          type="text"
          placeholder="Event title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />

        <div className="event-row">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <label className="event-allday">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            All day
          </label>
        </div>

        {!allDay && (
          <div className="event-row">
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <span className="event-dash">–</span>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            {rollsOvernight && <span className="hint">ends next day</span>}
          </div>
        )}

        <select
          className="event-select"
          value={spaceId ?? 'global'}
          onChange={(e) => setSpaceId(e.target.value === 'global' ? null : Number(e.target.value))}
        >
          <option value="global">Global (all spaces)</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <div className="event-row">
          <select
            className="event-select"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          >
            {RECURRENCE_PRESETS.map((p) => (
              <option key={p.label} value={p.rule ?? ''}>
                {p.label}
              </option>
            ))}
          </select>
          {preset === 'CUSTOM' && (
            <>
              <span className="event-dash">every</span>
              <input
                type="number"
                min={1}
                className="event-num"
                value={customN}
                onChange={(e) => setCustomN(Number(e.target.value))}
              />
              <select
                className="event-select"
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
              >
                <option value="DAILY">days</option>
                <option value="WEEKLY">weeks</option>
                <option value="MONTHLY">months</option>
              </select>
            </>
          )}
        </div>

        <input
          type="text"
          placeholder="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <textarea
          className="event-description"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {pendingScope ? (
          <div className="event-scope">
            <span className="event-scope-label">
              {pendingScope === 'delete' ? 'Delete recurring event' : 'Save changes to'}
            </span>
            <button type="button" className="event-scope-option" onClick={() => applyScope('this')}>
              This event
            </button>
            <button
              type="button"
              className="event-scope-option"
              onClick={() => applyScope('following')}
            >
              This and following events
            </button>
            <button type="button" className="event-scope-option" onClick={() => applyScope('all')}>
              All events
            </button>
            <button
              type="button"
              className="event-scope-back"
              onClick={() => setPendingScope(null)}
            >
              Back
            </button>
          </div>
        ) : (
          <div className="event-actions">
            {event && (
              <button type="button" className="event-delete" onClick={remove}>
                Delete
              </button>
            )}
            <span className="event-actions-spacer" />
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={title.trim().length === 0 || busy}
              onClick={save}
            >
              {event ? 'Save' : 'Create'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
