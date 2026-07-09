import { useEffect, useState } from 'react'
import type { ActivityEntry } from '../../../shared/types'
import { relativeTime } from '../format'

// Bottom of the left column (Part 5). Entries now carry the task's title and
// space (resolved server-side at read time) and click through to the task —
// the 0.1.0 feed showed bare actions ("created · 2m ago") with nothing to
// identify the item and no way to open it. The list refreshes when the window
// regains focus, so it doesn't fossilise at whatever it showed on first load.
export default function ActivityFeed({
  onOpenTask
}: {
  onOpenTask?: (spaceId: number, taskId: number) => void
}): React.JSX.Element {
  const [entries, setEntries] = useState<ActivityEntry[]>([])

  useEffect(() => {
    const load = (): void => {
      window.kaseki.activity.list().then(setEntries)
    }
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [])

  return (
    <section className="region activity-region" aria-label="Activity">
      <span className="region-title">Activity</span>
      {entries.length === 0 ? (
        <p className="activity-empty">
          Nothing here yet — recent changes across your spaces will show up here.
        </p>
      ) : (
        <ul className="activity-list">
          {entries.map((e) => {
            const openable = e.title != null && e.spaceId != null
            const body = (
              <>
                <span className="activity-dot" style={e.accent ? { background: e.accent } : undefined} />
                <span className="activity-title">{e.title ?? '(deleted task)'}</span>
                <span className="activity-action">{e.action}</span>
                <span className="activity-time">{relativeTime(e.createdAt)}</span>
              </>
            )
            return (
              <li key={e.id} className="activity-entry">
                {openable ? (
                  <button
                    type="button"
                    className="activity-open"
                    onClick={() => onOpenTask?.(e.spaceId as number, e.itemId)}
                  >
                    {body}
                  </button>
                ) : (
                  <span className="activity-open activity-open-static">{body}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
