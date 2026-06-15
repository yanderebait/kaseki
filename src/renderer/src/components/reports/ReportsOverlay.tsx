import { useEffect, useMemo, useState } from 'react'
import type { BillingMode, TimeReportRow } from '../../../../shared/types'
import { BILLING_LABELS, computeAmount } from '../../../../shared/billing'
import { fmtDuration, fmtDueDate, fmtMoney } from '../../format'
import { useOrb } from '../../orbState'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { Download, X } from '../../icons'

// One task's rolled-up time and billing across the report window.
interface TaskGroup {
  taskId: number
  taskTitle: string
  spaceName: string
  billingMode: BillingMode
  billingRate: number | null
  billingUnits: number | null
  totalMinutes: number
  weeks: { weekStart: string; minutes: number }[]
  billable: number | null
}

// Roll the per-(task, week) rows up to per-task, computing each task's billable
// from its mode and total minutes (a fixed/unit price isn't per-week, so it's
// only meaningful at the task level).
function groupByTask(rows: TimeReportRow[]): TaskGroup[] {
  const map = new Map<number, TaskGroup>()
  for (const r of rows) {
    let g = map.get(r.taskId)
    if (!g) {
      g = {
        taskId: r.taskId,
        taskTitle: r.taskTitle,
        spaceName: r.spaceName,
        billingMode: r.billingMode,
        billingRate: r.billingRate,
        billingUnits: r.billingUnits,
        totalMinutes: 0,
        weeks: [],
        billable: null
      }
      map.set(r.taskId, g)
    }
    g.totalMinutes += r.minutes
    g.weeks.push({ weekStart: r.weekStart, minutes: r.minutes })
  }
  const groups = [...map.values()]
  for (const g of groups) g.billable = computeAmount(g.billingMode, g.billingRate, g.billingUnits, g.totalMinutes)
  return groups
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function buildCsv(rows: TimeReportRow[]): string {
  const header = ['Space', 'Task', 'Week starting', 'Hours', 'Minutes', 'Billing', 'Rate']
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.spaceName),
        csvEscape(r.taskTitle),
        r.weekStart,
        (r.minutes / 60).toFixed(2),
        String(r.minutes),
        csvEscape(BILLING_LABELS[r.billingMode]),
        r.billingRate !== null ? String(r.billingRate) : ''
      ].join(',')
    )
  }
  return lines.join('\n')
}

// The time & billing report (Part 7), opened from the dashboard header. Shows
// hours per task per week with each task's billable total, a billable-this-month
// summary, a current-space / all-spaces toggle, and CSV export.
export default function ReportsOverlay({
  spaceId,
  spaceName,
  currency,
  onClose
}: {
  spaceId: number
  spaceName: string
  currency: string
  onClose: () => void
}): React.JSX.Element {
  const [scope, setScope] = useState<'space' | 'all'>('space')
  const [rows, setRows] = useState<TimeReportRow[]>([])
  const [monthRows, setMonthRows] = useState<TimeReportRow[]>([])
  const { flash } = useOrb()
  const trapRef = useFocusTrap<HTMLDivElement>()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const sid = scope === 'all' ? null : spaceId
    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
    window.kaseki.tasks.timeReport({ spaceId: sid }).then(setRows)
    window.kaseki.tasks.timeReport({ spaceId: sid, from: monthStart, to: monthEnd }).then(setMonthRows)
  }, [scope, spaceId])

  const groups = useMemo(() => groupByTask(rows), [rows])
  const monthGroups = useMemo(() => groupByTask(monthRows), [monthRows])
  const monthMinutes = monthGroups.reduce((sum, g) => sum + g.totalMinutes, 0)
  const monthBillable = monthGroups.reduce((sum, g) => sum + (g.billable ?? 0), 0)

  async function exportCsv(): Promise<void> {
    const name = scope === 'all' ? 'Kaseki — all spaces' : `${spaceName} — Kaseki`
    const result = await window.kaseki.reports.exportCsv(name, buildCsv(rows))
    if (result.ok) flash('saved')
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={trapRef}
        className="reports"
        role="dialog"
        aria-modal="true"
        aria-label="Time and billing report"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="reports-head">
          <h2 className="reports-title">Time &amp; billing</h2>
          <div className="view-toggle" role="group" aria-label="Report scope">
            <button
              type="button"
              className={scope === 'space' ? 'active' : ''}
              aria-pressed={scope === 'space'}
              onClick={() => setScope('space')}
            >
              {spaceName}
            </button>
            <button
              type="button"
              className={scope === 'all' ? 'active' : ''}
              aria-pressed={scope === 'all'}
              onClick={() => setScope('all')}
            >
              All spaces
            </button>
          </div>
          <span className="reports-spacer" />
          <button type="button" className="reports-export" onClick={exportCsv} disabled={rows.length === 0}>
            <Download size={16} />
            Export CSV
          </button>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="reports-summary">
          <span className="reports-summary-label">Billable this month</span>
          <span className="reports-summary-value">{fmtMoney(monthBillable, currency)}</span>
          <span className="reports-summary-meta">{fmtDuration(monthMinutes)} tracked</span>
        </div>

        <div className="reports-body">
          {groups.length === 0 ? (
            <p className="hint">No time tracked yet.</p>
          ) : (
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th className="num">Hours</th>
                  <th className="num">Billable</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <ReportTaskRows key={g.taskId} group={g} showSpace={scope === 'all'} currency={currency} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function ReportTaskRows({
  group,
  showSpace,
  currency
}: {
  group: TaskGroup
  showSpace: boolean
  currency: string
}): React.JSX.Element {
  return (
    <>
      <tr className="reports-task-row">
        <td>
          <span className="reports-task-title">{group.taskTitle}</span>
          {showSpace && <span className="reports-task-space">{group.spaceName}</span>}
        </td>
        <td className="num">{fmtDuration(group.totalMinutes)}</td>
        <td className="num">{group.billable !== null ? fmtMoney(group.billable, currency) : '—'}</td>
      </tr>
      {group.weeks.map((w) => (
        <tr key={w.weekStart} className="reports-week-row">
          <td>Week of {fmtDueDate(`${w.weekStart}T12:00:00`)}</td>
          <td className="num">{fmtDuration(w.minutes)}</td>
          <td className="num" />
        </tr>
      ))}
    </>
  )
}
