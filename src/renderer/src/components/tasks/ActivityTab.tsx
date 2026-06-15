import type { ActivityEntry } from '../../../../shared/types'
import { relativeTime } from '../../format'

// The Activity tab (Part 8): the task's change history, newest first.
export default function ActivityTab({ activity }: { activity: ActivityEntry[] }): React.JSX.Element {
  if (activity.length === 0) return <p className="hint">No activity yet.</p>
  return (
    <ul className="activity-list">
      {activity.map((a) => (
        <li key={a.id} className="activity-row">
          <span className="activity-action">{a.action}</span>
          {a.oldValue != null && a.newValue != null && (
            <span className="activity-change">
              {a.oldValue || '—'} → {a.newValue || '—'}
            </span>
          )}
          <span className="activity-time">{relativeTime(a.createdAt)}</span>
        </li>
      ))}
    </ul>
  )
}
