import { useEffect, useState } from 'react'
import {
  Bookmark,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Cloud,
  Grid,
  List,
  Note,
  Pencil,
  Plus,
  X
} from '../icons'
import {
  WIDGET_META,
  addWidget,
  availableWidgets,
  moveWidget,
  normalizeLayout,
  removeWidget,
  type WidgetType
} from '../../../shared/widgets'
import NotesWidget from './widgets/NotesWidget'
import UpcomingWidget from './widgets/UpcomingWidget'
import ClocksWidget from './widgets/ClocksWidget'
import BookmarksWidget from './widgets/BookmarksWidget'
import WeatherWidget from './widgets/WeatherWidget'

type WidgetView = 'list' | 'grid'

const ICONS: Record<WidgetType, (p: { size?: number }) => React.JSX.Element> = {
  notes: Note,
  upcoming: Calendar,
  clocks: Clock,
  bookmarks: Bookmark,
  weather: Cloud
}

// The home screen's widget area (Part 5). Phase 1 shipped five inert
// placeholder cells and a disabled "Add widget (coming soon)" button; as of
// v0.3.0 these are real. The layout — which widgets, in what order — is a
// preference, and so is each widget's own content, so nothing here needed a
// schema change. "Edit" reveals the reorder / remove controls and each
// widget's own management (add a clock, add a bookmark); outside edit mode
// the widgets are just content.
export default function WidgetArea({
  onOpenTask,
  onOpenSpace,
  onOpenSettings
}: {
  onOpenTask?: (spaceId: number, taskId: number) => void
  onOpenSpace?: (spaceId: number) => void
  onOpenSettings?: (category: string) => void
}): React.JSX.Element {
  const [view, setView] = useState<WidgetView>('list')
  const [layout, setLayout] = useState<WidgetType[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    window.kaseki.prefs.get().then((p) => {
      if (p.widgetView === 'grid' || p.widgetView === 'list') setView(p.widgetView)
      setLayout(normalizeLayout(p.widgets))
    })
  }, [])

  function chooseView(v: WidgetView): void {
    setView(v)
    window.kaseki.prefs.set({ widgetView: v })
  }

  function save(next: WidgetType[]): void {
    setLayout(next)
    window.kaseki.prefs.set({ widgets: next })
  }

  if (layout === null) {
    return <section className="region widget-region" aria-label="Widgets" />
  }

  const available = availableWidgets(layout)

  function body(type: WidgetType): React.JSX.Element {
    switch (type) {
      case 'notes':
        return <NotesWidget />
      case 'upcoming':
        return <UpcomingWidget onOpenTask={onOpenTask} onOpenSpace={onOpenSpace} />
      case 'clocks':
        return <ClocksWidget editing={editing} />
      case 'bookmarks':
        return <BookmarksWidget editing={editing} />
      case 'weather':
        return <WeatherWidget onOpenSettings={onOpenSettings} />
    }
  }

  return (
    <section className="region widget-region" aria-label="Widgets">
      <div className="widget-header">
        <span className="widget-title">Widgets</span>
        <div className="widget-header-actions">
          <button
            type="button"
            className={`widget-edit-toggle${editing ? ' active' : ''}`}
            aria-pressed={editing}
            onClick={() => {
              setEditing((e) => !e)
              setPicking(false)
            }}
          >
            {editing ? <Check size={14} /> : <Pencil size={14} />}
            {editing ? 'Done' : 'Edit'}
          </button>
          <div className="view-toggle" role="group" aria-label="Widget layout">
            <button
              type="button"
              className={view === 'list' ? 'active' : ''}
              aria-label="List view"
              aria-pressed={view === 'list'}
              onClick={() => chooseView('list')}
            >
              <List size={16} />
            </button>
            <button
              type="button"
              className={view === 'grid' ? 'active' : ''}
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              onClick={() => chooseView('grid')}
            >
              <Grid size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className={`widget-area widget-area-${view}`}>
        {layout.map((type, i) => {
          const meta = WIDGET_META[type]
          const Icon = ICONS[type]
          return (
            <article key={type} className={`widget-card widget-card-${type}`} aria-label={meta.name}>
              <header className="widget-card-header">
                <span className="widget-icon">
                  <Icon size={16} />
                </span>
                <span className="widget-name">{meta.name}</span>
                {editing && (
                  <span className="widget-card-controls">
                    <button
                      type="button"
                      aria-label={`Move ${meta.name} up`}
                      disabled={i === 0}
                      onClick={() => save(moveWidget(layout, type, -1))}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${meta.name} down`}
                      disabled={i === layout.length - 1}
                      onClick={() => save(moveWidget(layout, type, 1))}
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${meta.name}`}
                      onClick={() => save(removeWidget(layout, type))}
                    >
                      <X size={14} />
                    </button>
                  </span>
                )}
              </header>
              <div className="widget-card-body">{body(type)}</div>
            </article>
          )
        })}

        {layout.length === 0 && !picking && (
          <p className="widget-empty">No widgets. Add one below.</p>
        )}

        {picking ? (
          <div className="widget-picker" role="menu" aria-label="Add a widget">
            {available.map((type) => {
              const meta = WIDGET_META[type]
              const Icon = ICONS[type]
              return (
                <button
                  key={type}
                  type="button"
                  role="menuitem"
                  className="widget-picker-item"
                  onClick={() => {
                    save(addWidget(layout, type))
                    setPicking(false)
                  }}
                >
                  <span className="widget-icon">
                    <Icon size={18} />
                  </span>
                  <span className="widget-meta">
                    <span className="widget-name">{meta.name}</span>
                    <span className="widget-desc">
                      {meta.description}
                      {meta.network ? ' · uses the network once you set a location' : ''}
                    </span>
                  </span>
                </button>
              )
            })}
            <button type="button" className="widget-picker-cancel" onClick={() => setPicking(false)}>
              Cancel
            </button>
          </div>
        ) : (
          available.length > 0 && (
            <button type="button" className="widget-add" onClick={() => setPicking(true)}>
              <Plus size={18} />
              Add widget
            </button>
          )
        )}
      </div>
    </section>
  )
}
