import { useEffect, useState } from 'react'
import type { Task, TaskSummary } from '../../../../shared/types'
import { CheckCircle, Circle, X } from '../../icons'

// The Dependencies tab (Part 8): both directions of the DAG. "Waiting on" lists
// upstream blockers (with their completion state) and offers a picker to add
// one — refused on a cycle. "Blocks" lists downstream tasks. Each is clickable
// to navigate to that task's detail.
export default function DependenciesTab({
  taskId,
  spaceId,
  blockers,
  blocking,
  reload,
  onOpenTask
}: {
  taskId: number
  spaceId: number
  blockers: Task[]
  blocking: Task[]
  reload: () => void
  onOpenTask?: (id: number) => void
}): React.JSX.Element {
  const [candidates, setCandidates] = useState<TaskSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.kaseki.tasks.list(spaceId).then(setCandidates)
  }, [spaceId, blockers, blocking])

  async function addBlocker(upstreamId: number): Promise<void> {
    const result = await window.kaseki.tasks.addDependency(upstreamId, taskId)
    if (result.ok) {
      setError(null)
      reload()
    } else {
      setError(result.error ?? 'Could not add that dependency.')
    }
  }

  const excluded = new Set([taskId, ...blockers.map((b) => b.id), ...blocking.map((b) => b.id)])
  const options = candidates.filter((c) => !excluded.has(c.id))

  return (
    <div className="deps-tab">
      <section>
        <h4 className="deps-heading">Waiting on</h4>
        {blockers.map((b) => (
          <DepRow
            key={b.id}
            task={b}
            onOpen={() => onOpenTask?.(b.id)}
            onRemove={() => window.kaseki.tasks.removeDependency(b.id, taskId).then(reload)}
          />
        ))}
        {blockers.length === 0 && <p className="hint">Not waiting on anything.</p>}
        <select
          className="deps-add"
          value=""
          onChange={(e) => {
            if (e.target.value) addBlocker(Number(e.target.value))
          }}
        >
          <option value="">Add a task this depends on…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
        {error && <p className="vault-error">{error}</p>}
      </section>

      <section>
        <h4 className="deps-heading">Blocks</h4>
        {blocking.map((b) => (
          <DepRow
            key={b.id}
            task={b}
            onOpen={() => onOpenTask?.(b.id)}
            onRemove={() => window.kaseki.tasks.removeDependency(taskId, b.id).then(reload)}
          />
        ))}
        {blocking.length === 0 && <p className="hint">Doesn’t block anything.</p>}
      </section>
    </div>
  )
}

function DepRow({
  task,
  onOpen,
  onRemove
}: {
  task: Task
  onOpen: () => void
  onRemove: () => void
}): React.JSX.Element {
  const done = task.status === 'Done'
  return (
    <div className="dep-row">
      <button type="button" className="dep-link" onClick={onOpen}>
        <span className={done ? 'dep-done' : 'dep-open'}>
          {done ? <CheckCircle size={16} /> : <Circle size={16} />}
        </span>
        <span className={done ? 'dep-title done' : 'dep-title'}>{task.title}</span>
      </button>
      <button type="button" className="row-remove" aria-label="Remove dependency" onClick={onRemove}>
        <X size={16} />
      </button>
    </div>
  )
}
