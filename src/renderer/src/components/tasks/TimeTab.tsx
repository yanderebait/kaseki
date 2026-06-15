import { useState } from 'react'
import type { TimeEntry } from '../../../../shared/types'
import { fmtDuration, fmtDueDate } from '../../format'
import { usePomodoro } from '../../pomodoro'
import { Clock, Pencil, Play, Plus, Trash } from '../../icons'

// The local calendar date (YYYY-MM-DD), for defaulting the manual-entry date.
function todayIso(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

// The Time tab (Part 7): the task's logged entries plus a manual-entry form.
// Entries can be edited (the form switches to edit mode, pre-filled) or
// deleted; pomodoro sessions — logged automatically in commit C — are badged
// but otherwise behave the same. Manual entries are stamped at noon UTC so the
// chosen calendar date is stable across time zones and weekly bucketing.
export default function TimeTab({
  taskId,
  taskTitle,
  entries,
  reload
}: {
  taskId: number
  taskTitle: string
  entries: TimeEntry[]
  reload: () => void
}): React.JSX.Element {
  const { session, start } = usePomodoro()
  const [editId, setEditId] = useState<number | null>(null)
  const [date, setDate] = useState(todayIso())
  const [hours, setHours] = useState('')
  const [mins, setMins] = useState('')
  const [note, setNote] = useState('')

  const total = entries.reduce((sum, e) => sum + e.duration, 0)
  const rows = [...entries].sort((a, b) => (a.startAt < b.startAt ? 1 : -1))
  const duration = (Number(hours) || 0) * 60 + (Number(mins) || 0)

  function reset(): void {
    setEditId(null)
    setDate(todayIso())
    setHours('')
    setMins('')
    setNote('')
  }

  function startEdit(e: TimeEntry): void {
    setEditId(e.id)
    setDate(e.startAt.slice(0, 10))
    setHours(Math.floor(e.duration / 60) > 0 ? String(Math.floor(e.duration / 60)) : '')
    setMins(e.duration % 60 > 0 ? String(e.duration % 60) : '')
    setNote(e.note ?? '')
  }

  async function submit(): Promise<void> {
    if (duration <= 0) return
    const startAt = `${date}T12:00:00.000Z`
    const trimmed = note.trim() || null
    if (editId !== null) {
      await window.kaseki.tasks.updateTime(editId, { startAt, duration, note: trimmed })
    } else {
      await window.kaseki.tasks.addTime({ taskId, startAt, duration, note: trimmed })
    }
    reset()
    reload()
  }

  async function remove(id: number): Promise<void> {
    await window.kaseki.tasks.deleteTime(id)
    if (editId === id) reset()
    reload()
  }

  const sessionHere = session?.taskId === taskId

  return (
    <div className="time-tab">
      <div className="time-head">
        <span className="time-total">
          <Clock size={15} />
          {fmtDuration(total)} tracked
        </span>
        {sessionHere ? (
          <span className="time-running">Pomodoro running…</span>
        ) : (
          <button
            type="button"
            className="time-pomodoro"
            onClick={() => start(taskId, taskTitle)}
            disabled={session !== null}
            title={session !== null ? 'A session is already running' : 'Start a 25-minute session'}
          >
            <Play size={14} />
            Start pomodoro
          </button>
        )}
      </div>

      <div className="time-list">
        {rows.map((e) => (
          <div key={e.id} className={`time-row${editId === e.id ? ' editing' : ''}`}>
            <span className="time-row-date">{fmtDueDate(e.startAt)}</span>
            <span className="time-row-dur">{fmtDuration(e.duration)}</span>
            {e.isPomodoro && <span className="time-row-badge">Pomodoro</span>}
            {e.note && (
              <span className="time-row-note" title={e.note}>
                {e.note}
              </span>
            )}
            <button type="button" className="row-move" aria-label="Edit entry" onClick={() => startEdit(e)}>
              <Pencil size={15} />
            </button>
            <button type="button" className="row-remove" aria-label="Delete entry" onClick={() => remove(e.id)}>
              <Trash size={15} />
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="hint">No time logged yet.</p>}
      </div>

      <div className="time-form">
        <span className="time-form-title">{editId !== null ? 'Edit entry' : 'Log time'}</span>
        <div className="time-form-grid">
          <label>
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            <span>Duration</span>
            <span className="time-form-hm">
              <input type="number" min="0" placeholder="0" value={hours} onChange={(e) => setHours(e.target.value)} />
              <span>h</span>
              <input
                type="number"
                min="0"
                max="59"
                placeholder="0"
                value={mins}
                onChange={(e) => setMins(e.target.value)}
              />
              <span>m</span>
            </span>
          </label>
        </div>
        <input
          className="time-form-note"
          type="text"
          placeholder="Note (optional)…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <div className="time-form-actions">
          {editId !== null && (
            <button type="button" className="time-form-cancel" onClick={reset}>
              Cancel
            </button>
          )}
          <button type="button" className="row-add" onClick={submit} disabled={duration <= 0}>
            <Plus size={16} />
            {editId !== null ? 'Save entry' : 'Add entry'}
          </button>
        </div>
      </div>
    </div>
  )
}
