import { useEffect, useRef, useState } from 'react'
import type { Space, Task } from '../../../shared/types'
import { useFocusTrap } from '../hooks/useFocusTrap'

// Quick capture (Part 15, Shift+N): the fastest way to add a task from
// anywhere — a title, a space (defaulting to the current one), and an optional
// due date. Enter creates and hands the new task back so the app can open it.
export default function QuickCapture({
  defaultSpaceId,
  onClose,
  onCreated
}: {
  defaultSpaceId?: number
  onClose: () => void
  onCreated: (task: Task) => void
}): React.JSX.Element {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [spaceId, setSpaceId] = useState<number | null>(defaultSpaceId ?? null)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const trapRef = useFocusTrap<HTMLDivElement>()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.kaseki.spaces.list().then((s) => {
      setSpaces(s)
      setSpaceId((cur) => cur ?? s[0]?.id ?? null)
    })
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function create(): Promise<void> {
    const t = title.trim()
    if (!t || spaceId == null) return
    const task = await window.kaseki.tasks.create({ spaceId, title: t, dueDate: due || null })
    onCreated(task)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={trapRef}
        className="quick-capture"
        role="dialog"
        aria-modal="true"
        aria-label="Quick capture"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="quick-capture-title"
          type="text"
          placeholder="New task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') create()
          }}
          aria-label="Task title"
        />
        <div className="quick-capture-row">
          <select
            value={spaceId ?? ''}
            onChange={(e) => setSpaceId(Number(e.target.value))}
            aria-label="Space"
          >
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
          <button
            type="button"
            className="quick-capture-add"
            onClick={create}
            disabled={title.trim() === '' || spaceId == null}
          >
            Add task
          </button>
        </div>
      </div>
    </div>
  )
}
