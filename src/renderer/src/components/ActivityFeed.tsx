import { useEffect, useState } from 'react'
import type { ActivityEntry } from '../../../shared/types'
import { relativeTime } from '../format'

// Bottom of the left column (Part 5). Reads activity:list; nothing writes
// to the log yet, so the empty state shows in Phase 1. The entry layout
// (space dot, action, relative time) is defined here so the feed lights
// up unchanged once the task/note/file phases record activity.
export default function ActivityFeed(): React.JSX.Element {
  const [entries, setEntries] = useState<ActivityEntry[]>([])

  useEffect(() => {
    window.kaseki.activity.list().then(setEntries)
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
          {entries.map((e) => (
            <li key={e.id} className="activity-entry">
              <span className="activity-dot" />
              <span className="activity-action">{e.action}</span>
              <span className="activity-time">{relativeTime(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
