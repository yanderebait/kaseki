import { useCallback, useEffect, useState } from 'react'
import type { Space, TaskSummary, TaskTemplate } from '../../../../shared/types'
import { useOrb } from '../../orbState'
import { Plus, Search } from '../../icons'
import TaskCard from './TaskCard'

// The dashboard's task list (Part 6): scoped search, quick-add, a from-template
// menu, and the stack of cards. Cmd/Ctrl/Shift-click multi-selects to reveal a
// bulk action bar; a plain click opens the detail. Completing a task gives the
// Orb its task-done moment.
export default function TaskList({
  spaceId,
  accentColor,
  statusSet,
  reloadSignal = 0,
  onOpenTask
}: {
  spaceId: number
  accentColor: string | null
  statusSet: string[]
  reloadSignal?: number
  onOpenTask?: (id: number) => void
}): React.JSX.Element {
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [query, setQuery] = useState('')
  const [title, setTitle] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [spaces, setSpaces] = useState<Space[]>([])
  const [bulkTag, setBulkTag] = useState('')
  const { flash, rest } = useOrb()

  const refresh = useCallback(() => {
    const q = query.trim()
    const p = q ? window.kaseki.tasks.search(spaceId, q) : window.kaseki.tasks.list(spaceId)
    p.then(setTasks)
    window.kaseki.tasks.templates(spaceId).then(setTemplates)
  }, [spaceId, query])

  useEffect(refresh, [refresh, reloadSignal])
  useEffect(() => {
    window.kaseki.spaces.list().then(setSpaces)
  }, [])
  useEffect(() => setSelected(new Set()), [spaceId])

  async function add(): Promise<void> {
    const t = title.trim()
    if (t === '') return
    await window.kaseki.tasks.create({ spaceId, title: t, status: statusSet[0] ?? null })
    setTitle('')
    refresh()
  }

  async function complete(task: TaskSummary): Promise<void> {
    const done = task.status === 'Done'
    await window.kaseki.tasks.update(task.id, { status: done ? (statusSet[0] ?? null) : 'Done' })
    if (!done) flash('task-done')
    refresh()
  }

  function openOrSelect(id: number, e: React.MouseEvent): void {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      setSelected((s) => {
        const next = new Set(s)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    } else if (selected.size > 0) {
      setSelected(new Set())
    } else {
      onOpenTask?.(id)
    }
  }

  // Run an action over every selected task, then clear and refresh.
  async function bulk(fn: (id: number) => Promise<void>): Promise<void> {
    for (const id of selected) await fn(id)
    setSelected(new Set())
    refresh()
  }

  async function applyTemplate(id: number): Promise<void> {
    rest('working')
    try {
      const task = await window.kaseki.tasks.applyTemplate(id)
      refresh()
      onOpenTask?.(task.id)
    } finally {
      rest('idle')
    }
  }

  return (
    <section className="region task-list" aria-label="Tasks" data-tour="tasks">
      <div className="task-list-head">
        <div className="task-list-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {templates.length > 0 && (
          <select
            className="task-template-select"
            value=""
            onChange={(e) => {
              if (e.target.value) applyTemplate(Number(e.target.value))
            }}
          >
            <option value="">From template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="task-add">
        <input
          type="text"
          placeholder="Add a task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <button type="button" className="task-add-btn" aria-label="Add task" onClick={add} disabled={title.trim() === ''}>
          <Plus size={18} />
        </button>
      </div>

      {selected.size > 0 && (
        <div className="task-bulk">
          <span className="task-bulk-count">{selected.size} selected</span>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) bulk((id) => window.kaseki.tasks.update(id, { status: e.target.value }))
            }}
          >
            <option value="">Status…</option>
            {statusSet.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Add tag…"
            value={bulkTag}
            onChange={(e) => setBulkTag(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && bulkTag.trim()) {
                const tag = await window.kaseki.tasks.createTag(spaceId, bulkTag.trim())
                setBulkTag('')
                bulk((id) => window.kaseki.tasks.addTag(id, tag.id))
              }
            }}
          />
          <button type="button" onClick={() => bulk((id) => window.kaseki.tasks.update(id, { pinned: true }))}>
            Pin
          </button>
          <button type="button" onClick={() => bulk((id) => window.kaseki.tasks.update(id, { archived: true }))}>
            Archive
          </button>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) bulk((id) => window.kaseki.tasks.move(id, Number(e.target.value)))
            }}
          >
            <option value="">Move to…</option>
            {spaces
              .filter((s) => s.id !== spaceId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="task-bulk-delete"
            onClick={() => {
              if (window.confirm(`Delete ${selected.size} task(s)? This cannot be undone.`)) {
                bulk((id) => window.kaseki.tasks.delete(id))
              }
            }}
          >
            Delete
          </button>
          <button type="button" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      <div className="task-cards">
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            accentColor={accentColor}
            selected={selected.has(t.id)}
            onComplete={complete}
            onOpen={openOrSelect}
          />
        ))}
        {tasks.length === 0 && (
          <p className="hint task-empty">
            {query.trim() ? 'No tasks match your search.' : 'No tasks yet — add one above.'}
          </p>
        )}
      </div>
    </section>
  )
}
