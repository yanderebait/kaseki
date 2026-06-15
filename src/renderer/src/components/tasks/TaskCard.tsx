import type { TaskSummary } from '../../../../shared/types'
import { AlertTriangle, Check, CheckCircle, Circle, LinkIcon, Pin } from '../../icons'
import { fmtDueDate } from '../../format'

// A task card in the dashboard list (Part 6): an accent strip, a quick-complete
// toggle, the title, status indicators (pinned, blocked, stale, awaiting
// response), and a metadata line. Stale tasks render dimmed. Clicking the card
// opens the detail slide-out (wired in the next commit); clicking the toggle
// completes the task without opening it.
export default function TaskCard({
  task,
  accentColor,
  selected,
  onComplete,
  onOpen
}: {
  task: TaskSummary
  accentColor: string | null
  selected?: boolean
  onComplete: (task: TaskSummary) => void
  onOpen?: (id: number, e: React.MouseEvent) => void
}): React.JSX.Element {
  const done = task.status === 'Done'
  return (
    <div
      className={`task-card${task.stale ? ' stale' : ''}${done ? ' done' : ''}${onOpen ? ' openable' : ''}${selected ? ' selected' : ''}`}
      style={{ '--card-accent': accentColor ?? 'var(--accent)' } as React.CSSProperties}
      onClick={onOpen ? (e) => onOpen(task.id, e) : undefined}
    >
      <span className="task-card-strip" />
      <button
        type="button"
        className="task-complete"
        aria-label={done ? 'Mark not done' : 'Mark done'}
        onClick={(e) => {
          e.stopPropagation()
          onComplete(task)
        }}
      >
        {done ? <CheckCircle size={18} /> : <Circle size={18} />}
      </button>
      <div className="task-card-body">
        <div className="task-card-titlerow">
          <span className="task-card-title">{task.title}</span>
          <span className="task-card-icons">
            {task.pinned && <Pin size={14} />}
            {task.blocked && <LinkIcon size={14} />}
            {task.stale && <AlertTriangle size={14} />}
            {task.status === 'Awaiting response' && <Check size={14} />}
          </span>
        </div>
        <div className="task-card-meta">
          {task.dueDate && <span>Due {fmtDueDate(task.dueDate)}</span>}
          {task.status && task.status !== 'Done' && (
            <span className="task-status-badge">{task.status}</span>
          )}
          {task.blocked && <span className="task-meta-warn">Blocked</span>}
          {task.stale && <span className="task-meta-warn">Stale · {task.staleDays} days</span>}
          {task.subtaskCount > 0 && (
            <span>
              {task.subtaskDone}/{task.subtaskCount} subtasks
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
