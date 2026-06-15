import { useCallback, useEffect, useState } from 'react'
import type { CalendarEvent, EventOccurrence } from '../../../shared/types'
import { Download, Plus } from '../icons'
import { fmtDayLabel, fmtTime, localKey, startOfDay } from '../calendarUtils'
import EventModal from './EventModal'

// null = modal closed. Otherwise the modal is open: event null = creating a
// new event; event set = editing (with occurrence when it's a series slot).
type ModalState = { event: CalendarEvent | null; occurrence?: EventOccurrence }

// The profession-dashboard calendar (Part 6): upcoming events for this space
// (+ Global), grouped by day, with create/edit and completion.
export default function DashboardCalendar({ spaceId }: { spaceId: number }): React.JSX.Element {
  const [events, setEvents] = useState<EventOccurrence[]>([])
  const [modal, setModal] = useState<ModalState | null>(null)

  const refresh = useCallback(() => {
    const start = startOfDay(new Date())
    const end = new Date(start)
    end.setDate(start.getDate() + 60)
    window.kaseki.events.occurrences(start.toISOString(), end.toISOString(), spaceId).then(setEvents)
  }, [spaceId])

  useEffect(refresh, [refresh])

  const groups = new Map<string, EventOccurrence[]>()
  for (const e of events) {
    const key = localKey(e.occurrenceStart)
    const arr = groups.get(key) ?? []
    arr.push(e)
    groups.set(key, arr)
  }
  const days = [...groups.keys()].sort()

  async function openEvent(occ: EventOccurrence): Promise<void> {
    const master = await window.kaseki.events.get(occ.masterId)
    setModal({ event: master, occurrence: occ })
  }

  function toggleComplete(occ: EventOccurrence): void {
    window.kaseki.events
      .setCompleted(occ.masterId, occ.originalStart, !occ.completed)
      .then(refresh)
  }

  return (
    <section className="region dashboard-cal" aria-label="Calendar" data-tour="calendar">
      <div className="dashboard-cal-head">
        <span className="region-title">Calendar</span>
        <span className="dashboard-cal-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="Export calendar (.ics)"
            title="Export calendar (.ics)"
            onClick={() => window.kaseki.events.exportIcs(spaceId)}
          >
            <Download size={18} />
          </button>
          <button type="button" className="row-add" onClick={() => setModal({ event: null })}>
            <Plus size={16} />
            Add event
          </button>
        </span>
      </div>

      {days.length === 0 ? (
        <p className="hint">No upcoming events.</p>
      ) : (
        <div className="dashboard-cal-list">
          {days.map((key) => (
            <div key={key} className="dashboard-cal-day">
              <span className="dashboard-cal-daylabel">{fmtDayLabel(key)}</span>
              {(groups.get(key) ?? []).map((e, i) => (
                <div key={i} className="dashboard-cal-event">
                  <input
                    type="checkbox"
                    checked={e.completed}
                    onChange={() => toggleComplete(e)}
                    aria-label="Completed"
                  />
                  <span className="dashboard-cal-time">
                    {e.allDay ? 'All day' : fmtTime(e.occurrenceStart)}
                  </span>
                  <button type="button" className="dashboard-cal-title" onClick={() => openEvent(e)}>
                    <span
                      className="dashboard-cal-dot"
                      style={{ background: e.accent ?? 'var(--text-tertiary)' }}
                    />
                    <span className={e.completed ? 'completed' : ''}>{e.title}</span>
                    {e.recurring && <span className="dashboard-cal-recur">↻</span>}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <EventModal
          event={modal.event}
          occurrence={modal.occurrence}
          defaultSpaceId={spaceId}
          onClose={() => setModal(null)}
          onSaved={refresh}
        />
      )}
    </section>
  )
}
