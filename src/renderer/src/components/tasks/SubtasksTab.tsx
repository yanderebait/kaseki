import { useState } from 'react'
import type { Subtask } from '../../../../shared/types'
import { CheckCircle, ChevronDown, ChevronUp, Circle, Plus, X } from '../../icons'

// The Subtasks tab (Part 8): a checklist with add, check, reorder, and remove.
export default function SubtasksTab({
  taskId,
  subtasks,
  reload
}: {
  taskId: number
  subtasks: Subtask[]
  reload: () => void
}): React.JSX.Element {
  const [title, setTitle] = useState('')

  async function add(): Promise<void> {
    const t = title.trim()
    if (t === '') return
    await window.kaseki.tasks.addSubtask(taskId, t)
    setTitle('')
    reload()
  }

  return (
    <div className="subtasks-tab">
      <div className="subtask-list">
        {subtasks.map((s, i) => (
          <div key={s.id} className="subtask-row">
            <button
              type="button"
              className={`subtask-check${s.completed ? ' done' : ''}`}
              aria-label={s.completed ? 'Mark incomplete' : 'Mark complete'}
              onClick={() =>
                window.kaseki.tasks.updateSubtask(s.id, { completed: !s.completed }).then(reload)
              }
            >
              {s.completed ? <CheckCircle size={18} /> : <Circle size={18} />}
            </button>
            <span className={`subtask-title${s.completed ? ' done' : ''}`}>{s.title}</span>
            <button
              type="button"
              className="row-move"
              aria-label="Move up"
              disabled={i === 0}
              onClick={() => window.kaseki.tasks.reorderSubtask(s.id, -1).then(reload)}
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              className="row-move"
              aria-label="Move down"
              disabled={i === subtasks.length - 1}
              onClick={() => window.kaseki.tasks.reorderSubtask(s.id, 1).then(reload)}
            >
              <ChevronDown size={16} />
            </button>
            <button
              type="button"
              className="row-remove"
              aria-label="Remove subtask"
              onClick={() => window.kaseki.tasks.deleteSubtask(s.id).then(reload)}
            >
              <X size={16} />
            </button>
          </div>
        ))}
        {subtasks.length === 0 && <p className="hint">No subtasks yet.</p>}
      </div>

      <div className="task-add">
        <input
          type="text"
          placeholder="Add a subtask…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <button type="button" className="task-add-btn" aria-label="Add subtask" onClick={add} disabled={title.trim() === ''}>
          <Plus size={18} />
        </button>
      </div>
    </div>
  )
}
