import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import type { SpaceBilling, TaskDetail, TaskPatch, TaskPriority } from '../../../../shared/types'
import { useOrb } from '../../orbState'
import { usePomodoro } from '../../pomodoro'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { fmtDuration } from '../../format'
import { Dots, Pin, Plus, X } from '../../icons'
import TaskFieldInput from './TaskFieldInput'
import TaskBillingFields from './TaskBillingFields'
import SubtasksTab from './SubtasksTab'
import TimeTab from './TimeTab'
import FilesTab from './FilesTab'
// The Notes tab pulls the Tiptap editor — code-split so Tiptap loads only when
// a task's notes are opened.
const NotesTab = lazy(() => import('./NotesTab'))
import ActivityTab from './ActivityTab'
import DependenciesTab from './DependenciesTab'

const PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High', 'Critical']

// The task detail slide-out (Part 8): animates in from the right over a dimmed,
// click-blocked dashboard. Fields are inline-edited (saved on change/blur, no
// Save button). This commit builds the shell, the metadata strip, and the
// Details tab; the other tabs land next.
export default function TaskDetailSlideout({
  taskId,
  spaceId,
  spaceName,
  spaceBilling,
  currency,
  statusSet,
  width,
  onClose,
  onChanged,
  onOpenTask,
  onOpenFile
}: {
  taskId: number
  spaceId: number
  spaceName: string
  spaceBilling: SpaceBilling
  currency: string
  statusSet: string[]
  width: number
  onClose: () => void
  onChanged: () => void
  onOpenTask?: (id: number) => void
  onOpenFile?: (fileId: number) => void
}): React.JSX.Element {
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [tab, setTab] = useState('details')
  const [menuOpen, setMenuOpen] = useState(false)
  const [newTag, setNewTag] = useState('')
  const { flash } = useOrb()
  const { loggedAt, lastLoggedTaskId } = usePomodoro()
  const seenLog = useRef(loggedAt)
  const trapRef = useFocusTrap<HTMLDivElement>()

  const reload = useCallback(() => {
    window.kaseki.tasks.get(taskId).then(setDetail)
  }, [taskId])
  useEffect(reload, [reload])

  // When a pomodoro logs time to this task (it may finish while the slide-out is
  // open), pull the new entry into the Time tab and the tracked-time strip.
  useEffect(() => {
    if (loggedAt !== seenLog.current) {
      seenLog.current = loggedAt
      if (lastLoggedTaskId === taskId) {
        reload()
        onChanged()
      }
    }
  }, [loggedAt, lastLoggedTaskId, taskId, reload, onChanged])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const patch = useCallback(
    async (p: TaskPatch) => {
      await window.kaseki.tasks.update(taskId, p)
      reload()
      onChanged()
    },
    [taskId, reload, onChanged]
  )

  async function setStatus(status: string): Promise<void> {
    if (status === 'Done') {
      const n = await window.kaseki.tasks.incompleteBlockers(taskId)
      if (n > 0 && !window.confirm(`This task depends on ${n} incomplete task(s) — mark Done anyway?`)) {
        return
      }
      flash('task-done')
    }
    patch({ status })
  }

  async function addTag(): Promise<void> {
    const name = newTag.trim()
    if (name === '') return
    const tag = await window.kaseki.tasks.createTag(spaceId, name)
    await window.kaseki.tasks.addTag(taskId, tag.id)
    setNewTag('')
    reload()
    onChanged()
  }

  async function removeTag(tagId: number): Promise<void> {
    await window.kaseki.tasks.removeTag(taskId, tagId)
    reload()
    onChanged()
  }

  async function setField(fieldId: number, value: string | null): Promise<void> {
    await window.kaseki.tasks.setField(taskId, fieldId, value)
    reload()
  }

  async function archive(): Promise<void> {
    await window.kaseki.tasks.update(taskId, { archived: true })
    onChanged()
    onClose()
  }

  async function remove(): Promise<void> {
    if (!window.confirm('Delete this task? This cannot be undone.')) return
    await window.kaseki.tasks.delete(taskId)
    onChanged()
    onClose()
  }

  async function saveAsTemplate(): Promise<void> {
    setMenuOpen(false)
    const name = window.prompt('Template name', detail?.title ?? 'Template')
    if (name && name.trim()) await window.kaseki.tasks.createTemplate(taskId, name.trim())
  }

  const depCount = detail ? detail.blockers.length + detail.blocking.length : 0
  const keyField = detail?.fields[0]

  return (
    <div className="slideout-backdrop" onClick={onClose}>
      <div
        ref={trapRef}
        className="slideout"
        role="dialog"
        aria-modal="true"
        aria-label="Task detail"
        style={{ width: `${width}%` }}
        onClick={(e) => e.stopPropagation()}
      >
        {detail && (
          <>
            <header className="slideout-head">
              <div className="slideout-head-top">
                <span className="slideout-crumb">{spaceName.toUpperCase()}</span>
                <div className="slideout-actions">
                  <button
                    type="button"
                    className={`icon-button${detail.pinned ? ' active' : ''}`}
                    aria-label={detail.pinned ? 'Unpin' : 'Pin'}
                    onClick={() => patch({ pinned: !detail.pinned })}
                  >
                    <Pin size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="More actions"
                    onClick={() => setMenuOpen((o) => !o)}
                  >
                    <Dots size={18} />
                  </button>
                  <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
                    <X size={18} />
                  </button>
                  {menuOpen && (
                    <>
                      <div className="orb-menu-backdrop" onClick={() => setMenuOpen(false)} />
                      <div className="slideout-menu" role="menu">
                        <button type="button" onClick={saveAsTemplate}>
                          Save as template
                        </button>
                        <button type="button" onClick={archive}>
                          Archive task
                        </button>
                        <button type="button" onClick={remove}>
                          Delete task
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <input
                key={`title-${taskId}`}
                className="slideout-title"
                defaultValue={detail.title}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== detail.title) patch({ title: v })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
              />
            </header>

            <div className="slideout-meta">
              <div className="slideout-meta-cell">
                <span className="slideout-meta-label">Status</span>
                <select value={detail.status ?? ''} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">—</option>
                  {statusSet.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="slideout-meta-cell">
                <span className="slideout-meta-label">Due</span>
                <input
                  type="date"
                  value={detail.dueDate ? detail.dueDate.slice(0, 10) : ''}
                  onChange={(e) => patch({ dueDate: e.target.value || null })}
                />
              </div>
              <div className="slideout-meta-cell">
                <span className="slideout-meta-label">Time tracked</span>
                <span className="slideout-meta-value">{fmtDuration(detail.timeTracked)}</span>
              </div>
              <div className="slideout-meta-cell">
                <span className="slideout-meta-label">{keyField ? keyField.name : 'Priority'}</span>
                <span className="slideout-meta-value">
                  {keyField ? (keyField.value ?? '—') : (detail.priority ?? '—')}
                </span>
              </div>
            </div>

            <nav className="slideout-tabs" role="tablist">
              {[
                { id: 'details', label: 'Details' },
                { id: 'subtasks', label: `Subtasks · ${detail.subtasks.length}` },
                { id: 'time', label: `Time · ${detail.timeEntries.length}` },
                { id: 'files', label: `Files · ${detail.files.length}` },
                { id: 'notes', label: 'Notes' },
                { id: 'activity', label: 'Activity' },
                { id: 'deps', label: `Dependencies · ${depCount}` }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={tab === t.id ? 'active' : ''}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            <div className="slideout-body">
              {tab === 'details' ? (
                <div className="task-details">
                  <label className="task-details-field">
                    <span className="task-details-label">Description</span>
                    <textarea
                      key={`desc-${taskId}`}
                      className="task-description"
                      placeholder="Add context…"
                      defaultValue={detail.description ?? ''}
                      onBlur={(e) => patch({ description: e.target.value || null })}
                    />
                  </label>

                  <div className="task-details-row">
                    <label className="task-details-field">
                      <span className="task-details-label">Priority</span>
                      <select
                        value={detail.priority ?? ''}
                        onChange={(e) =>
                          patch({ priority: (e.target.value || null) as TaskPriority | null })
                        }
                      >
                        <option value="">—</option>
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                    {detail.estimatedTime !== null && (
                      <div className="task-details-field">
                        <span className="task-details-label">Estimated vs tracked</span>
                        <span className="slideout-meta-value">
                          {fmtDuration(detail.estimatedTime)} / {fmtDuration(detail.timeTracked)}
                        </span>
                      </div>
                    )}
                  </div>

                  <TaskBillingFields
                    detail={detail}
                    spaceBilling={spaceBilling}
                    currency={currency}
                    onPatch={patch}
                  />

                  {detail.fields.length > 0 && (
                    <div className="task-fields-grid">
                      {detail.fields.map((f) => (
                        <label key={f.fieldId} className="task-details-field">
                          <span className="task-details-label">{f.name}</span>
                          <TaskFieldInput field={f} onSave={(v) => setField(f.fieldId, v)} />
                        </label>
                      ))}
                    </div>
                  )}

                  <div className="task-details-field">
                    <span className="task-details-label">Tags</span>
                    <div className="task-tags">
                      {detail.tags.map((t) => (
                        <span key={t.id} className="task-tag">
                          {t.name}
                          <button type="button" aria-label={`Remove ${t.name}`} onClick={() => removeTag(t.id)}>
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                      <span className="task-tag-add">
                        <input
                          type="text"
                          placeholder="Add tag…"
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addTag()
                          }}
                        />
                        <button type="button" aria-label="Add tag" onClick={addTag}>
                          <Plus size={14} />
                        </button>
                      </span>
                    </div>
                  </div>
                </div>
              ) : tab === 'subtasks' ? (
                <SubtasksTab taskId={taskId} subtasks={detail.subtasks} reload={reload} />
              ) : tab === 'time' ? (
                <TimeTab taskId={taskId} taskTitle={detail.title} entries={detail.timeEntries} reload={reload} />
              ) : tab === 'files' ? (
                <FilesTab
                  taskId={taskId}
                  files={detail.files}
                  reload={() => {
                    reload()
                    onChanged()
                  }}
                  onOpenFile={onOpenFile}
                />
              ) : tab === 'notes' ? (
                <Suspense fallback={<p className="hint">Loading editor…</p>}>
                  <NotesTab taskId={taskId} note={detail.note} />
                </Suspense>
              ) : tab === 'activity' ? (
                <ActivityTab activity={detail.activity} />
              ) : (
                <DependenciesTab
                  taskId={taskId}
                  spaceId={spaceId}
                  blockers={detail.blockers}
                  blocking={detail.blocking}
                  reload={() => {
                    reload()
                    onChanged()
                  }}
                  onOpenTask={onOpenTask}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
