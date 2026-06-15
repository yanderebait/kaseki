import { useEffect, useState } from 'react'
import type { EventOccurrence } from '../../../shared/types'
import { ArrowLeft, ChevronRight } from '../icons'
import { fmtTime, localKey, startOfDay } from '../calendarUtils'

// The home 7-day strip (Part 5), now live: a rolling week of real events,
// colour-coded by space, with day-click expansion and week paging.
export default function CalendarStrip(): React.JSX.Element {
  const [weekOffset, setWeekOffset] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [events, setEvents] = useState<EventOccurrence[]>([])

  const base = startOfDay(new Date())
  base.setDate(base.getDate() + weekOffset * 7)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    return d
  })

  useEffect(() => {
    const start = startOfDay(new Date())
    start.setDate(start.getDate() + weekOffset * 7)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    window.kaseki.events.occurrences(start.toISOString(), end.toISOString()).then(setEvents)
  }, [weekOffset])

  const byDay = new Map<string, EventOccurrence[]>()
  for (const e of events) {
    const key = localKey(e.occurrenceStart)
    const arr = byDay.get(key) ?? []
    arr.push(e)
    byDay.set(key, arr)
  }

  const today = localKey(new Date())
  const selectedEvents = selected ? (byDay.get(selected) ?? []) : []

  return (
    <section className="region calendar-region" aria-label="Calendar">
      <div className="calendar-strip">
        <button
          type="button"
          className="calendar-page"
          aria-label="Previous week"
          onClick={() => setWeekOffset((o) => o - 1)}
        >
          <ArrowLeft size={16} />
        </button>
        <div
          className="calendar-days"
          onWheel={(e) => {
            if (e.shiftKey) setWeekOffset((o) => o + (e.deltaY > 0 ? 1 : -1))
          }}
        >
          {days.map((d, i) => {
            const key = localKey(d)
            const dayEvents = byDay.get(key) ?? []
            return (
              <button
                key={i}
                type="button"
                className={`calendar-day${key === today ? ' today' : ''}${key === selected ? ' selected' : ''}`}
                onClick={() => setSelected((s) => (s === key ? null : key))}
              >
                <span className="calendar-weekday">
                  {d.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span className="calendar-date">{d.getDate()}</span>
                <span className="calendar-events">
                  {dayEvents.slice(0, 3).map((e, j) => (
                    <span
                      key={j}
                      className="calendar-bar"
                      style={{ background: e.accent ?? 'var(--text-tertiary)' }}
                    />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className="calendar-page"
          aria-label="Next week"
          onClick={() => setWeekOffset((o) => o + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
      {selected && (
        <div className="calendar-day-detail">
          {selectedEvents.length === 0 ? (
            <p className="hint">No events.</p>
          ) : (
            selectedEvents.map((e, i) => (
              <div key={i} className="calendar-event-row">
                <span
                  className="calendar-event-dot"
                  style={{ background: e.accent ?? 'var(--text-tertiary)' }}
                />
                <span className="calendar-event-time">
                  {e.allDay ? 'All day' : fmtTime(e.occurrenceStart)}
                </span>
                <span className={`calendar-event-title${e.completed ? ' completed' : ''}`}>
                  {e.title}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  )
}
