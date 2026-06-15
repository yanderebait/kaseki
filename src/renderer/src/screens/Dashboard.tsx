import { useCallback, useEffect, useState } from 'react'
import type { SpaceDetail } from '../../../shared/types'
import { FIELD_TYPE_LABELS } from '../fieldTypes'
import { ArrowLeft, Chart, List, Sidebar } from '../icons'
import LauncherDock from '../components/LauncherDock'
import DashboardCalendar from '../components/DashboardCalendar'
import TaskList from '../components/tasks/TaskList'
import TaskDetailSlideout from '../components/tasks/TaskDetailSlideout'
import PomodoroPill from '../components/PomodoroPill'
import ReportsOverlay from '../components/reports/ReportsOverlay'

const DEFAULT_SLIDEOUT_WIDTH = 60

// The profession dashboard (Part 6): a header with back, name, accent dot, and
// launcher dock; the task list and live calendar in the main column; a read-only
// view of the space's applied configuration alongside. A per-space density
// toggle compacts the layout.
export default function Dashboard({
  spaceId,
  onBack,
  onOpenFile,
  requestedTaskId
}: {
  spaceId: number
  onBack: () => void
  onOpenFile?: (fileId: number) => void
  requestedTaskId?: number
}): React.JSX.Element {
  const [space, setSpace] = useState<SpaceDetail | null>(null)
  const [compact, setCompact] = useState(false)
  const [openTaskId, setOpenTaskId] = useState<number | null>(null)
  const [taskReload, setTaskReload] = useState(0)
  const [slideoutWidth, setSlideoutWidth] = useState(DEFAULT_SLIDEOUT_WIDTH)
  const [currency, setCurrency] = useState('£')
  const [reportsOpen, setReportsOpen] = useState(false)

  useEffect(() => {
    window.kaseki.spaces.get(spaceId).then(setSpace)
  }, [spaceId])

  // Search and quick capture route a task here by asking the dashboard to open
  // its slide-out; reload so a freshly captured task also shows in the list.
  useEffect(() => {
    if (requestedTaskId != null) {
      setOpenTaskId(requestedTaskId)
      setTaskReload((n) => n + 1)
    }
  }, [requestedTaskId])

  useEffect(() => {
    window.kaseki.prefs.get().then((p) => {
      setCompact(p[`density_${spaceId}`] === 'compact')
      const w = Number(p.taskSlideoutWidth)
      if (w >= 30 && w <= 80) setSlideoutWidth(w)
      if (typeof p.currency === 'string' && p.currency) setCurrency(p.currency)
    })
  }, [spaceId])

  const toggleDensity = useCallback(() => {
    setCompact((c) => {
      const next = !c
      window.kaseki.prefs.set({ [`density_${spaceId}`]: next ? 'compact' : 'regular' })
      return next
    })
  }, [spaceId])

  if (!space) return <div className="dashboard" />

  return (
    <div className={`dashboard${compact ? ' compact' : ''}`}>
      <header className="dashboard-header">
        <button type="button" className="icon-button" aria-label="Back to home" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <span className="dashboard-title">{space.name}</span>
        <span
          className="dashboard-dot"
          style={{ background: space.accentColor ?? 'var(--accent)' }}
        />
        <span className="dashboard-spacer" />
        <PomodoroPill />
        <button
          type="button"
          className="icon-button"
          aria-label="Time and billing report"
          title="Time and billing report"
          onClick={() => setReportsOpen(true)}
        >
          <Chart size={18} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={compact ? 'Regular density' : 'Compact density'}
          aria-pressed={compact}
          title={compact ? 'Regular density' : 'Compact density'}
          onClick={toggleDensity}
        >
          {compact ? <List size={18} /> : <Sidebar size={18} />}
        </button>
        <LauncherDock spaceId={space.id} />
      </header>

      <div className="dashboard-body" id="main" tabIndex={-1}>
        <div className="dashboard-main">
          <TaskList
            spaceId={space.id}
            accentColor={space.accentColor}
            statusSet={space.statusSet}
            reloadSignal={taskReload}
            onOpenTask={setOpenTaskId}
          />
          <DashboardCalendar spaceId={space.id} />
        </div>

        <aside className="dashboard-config">
          <section>
            <span className="region-title">Custom fields</span>
            {space.fields.length === 0 ? (
              <p className="hint">No custom fields for this space.</p>
            ) : (
              <ul className="config-list">
                {space.fields.map((f, i) => (
                  <li key={i}>
                    <span>{f.name}</span>
                    <span className="config-type">{FIELD_TYPE_LABELS[f.type]}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <span className="region-title">Statuses</span>
            <div className="status-chips">
              {space.statusSet.map((s, i) => (
                <span key={i} className="status-chip">
                  {s}
                </span>
              ))}
            </div>
          </section>

          <section data-tour="cheatsheet">
            <span className="region-title">Cheatsheet</span>
            {space.cheatsheet.trim().length === 0 ? (
              <p className="hint">Empty — the editor arrives with the knowledge area (Phase 6).</p>
            ) : (
              <pre className="cheatsheet-text">{space.cheatsheet}</pre>
            )}
          </section>
        </aside>
      </div>

      {openTaskId !== null && (
        <TaskDetailSlideout
          taskId={openTaskId}
          spaceId={space.id}
          spaceName={space.name}
          spaceBilling={space.billing}
          currency={currency}
          statusSet={space.statusSet}
          width={slideoutWidth}
          onClose={() => setOpenTaskId(null)}
          onChanged={() => setTaskReload((n) => n + 1)}
          onOpenTask={(id) => setOpenTaskId(id)}
          onOpenFile={onOpenFile}
        />
      )}

      {reportsOpen && (
        <ReportsOverlay
          spaceId={space.id}
          spaceName={space.name}
          currency={currency}
          onClose={() => setReportsOpen(false)}
        />
      )}
    </div>
  )
}
