import { useEffect, useState } from 'react'
import type { UpcomingItem } from '../../../../shared/widgets'
import { CheckCircle, Calendar } from '../../icons'

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// A bare 'YYYY-MM-DD' is a local calendar date; new Date() would read it as
// UTC midnight and show the previous day west of Greenwich.
function parseWhen(item: UpcomingItem): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(item.when)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(item.when)
}

// "Today", "Tomorrow", "Thu 26 Nov" — plus the time for a timed event.
export function whenLabel(item: UpcomingItem, now: Date): string {
  const when = parseWhen(item)
  const days = Math.round((startOfDay(when) - startOfDay(now)) / DAY_MS)
  let day: string
  if (days === 0) day = 'Today'
  else if (days === 1) day = 'Tomorrow'
  else if (days === -1) day = 'Yesterday'
  else day = when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  if (item.kind === 'event' && !item.allDay) {
    return `${day} · ${when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
  }
  return day
}

// Upcoming: overdue and soon-due tasks plus the next week's events, across
// every space, in one list. Reads the live database each time the window
// regains focus, so it never shows a deadline that has since been met.
export default function UpcomingWidget({
  onOpenTask,
  onOpenSpace
}: {
  onOpenTask?: (spaceId: number, taskId: number) => void
  onOpenSpace?: (spaceId: number) => void
}): React.JSX.Element {
  const [items, setItems] = useState<UpcomingItem[] | null>(null)

  useEffect(() => {
    const load = (): void => {
      window.kaseki.widgets.upcoming().then(setItems)
    }
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [])

  if (items === null) return <p className="widget-empty">&nbsp;</p>
  if (items.length === 0) {
    return <p className="widget-empty">Nothing due and nothing scheduled in the next week.</p>
  }

  const now = new Date()
  return (
    <ul className="widget-upcoming">
      {items.map((item) => {
        const openable = item.spaceId != null
        const open = (): void => {
          if (item.spaceId == null) return
          if (item.kind === 'task') onOpenTask?.(item.spaceId, item.id)
          else onOpenSpace?.(item.spaceId)
        }
        const content = (
          <>
            <span
              className="widget-upcoming-kind"
              style={item.accentColor ? { color: item.accentColor } : undefined}
              title={item.kind === 'task' ? 'Task' : 'Event'}
            >
              {item.kind === 'task' ? <CheckCircle size={14} /> : <Calendar size={14} />}
            </span>
            <span className="widget-upcoming-title">{item.title}</span>
            {item.spaceName && <span className="widget-upcoming-space">{item.spaceName}</span>}
            <span className={`widget-upcoming-when${item.overdue ? ' overdue' : ''}`}>
              {item.overdue ? `Overdue · ${whenLabel(item, now)}` : whenLabel(item, now)}
            </span>
          </>
        )
        return (
          <li key={`${item.kind}-${item.id}-${item.when}`}>
            {openable ? (
              <button type="button" className="widget-upcoming-row" onClick={open}>
                {content}
              </button>
            ) : (
              <span className="widget-upcoming-row static">{content}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
