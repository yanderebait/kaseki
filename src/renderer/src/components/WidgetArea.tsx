import { useEffect, useState } from 'react'
import { Bookmark, Calendar, Clock, Cloud, Grid, List, Note, Plus } from '../icons'

type WidgetView = 'list' | 'grid'

// Phase 1 ships the widget area as a visual shell: real widgets (live
// previews, drag-reorder, the picker) are out of scope for the visual
// refresh and several depend on later data layers. These five are
// representative placeholders; "—" stands in for live-preview content.
const WIDGETS = [
  { key: 'notes', name: 'Quick Notes', desc: 'Scratchpad for ideas and lists', Icon: Note },
  { key: 'weather', name: 'Weather', desc: 'Current conditions and forecast', Icon: Cloud },
  { key: 'upcoming', name: 'Upcoming', desc: 'Deadlines and events across spaces', Icon: Calendar },
  { key: 'clocks', name: 'World Clocks', desc: 'Multiple time zones at a glance', Icon: Clock },
  { key: 'bookmarks', name: 'Bookmarks', desc: 'Quick links to frequent URLs', Icon: Bookmark }
]

export default function WidgetArea(): React.JSX.Element {
  const [view, setView] = useState<WidgetView>('list')

  useEffect(() => {
    window.kaseki.prefs.get().then((p) => {
      if (p.widgetView === 'grid' || p.widgetView === 'list') setView(p.widgetView)
    })
  }, [])

  function chooseView(v: WidgetView): void {
    setView(v)
    window.kaseki.prefs.set({ widgetView: v })
  }

  return (
    <section className="region widget-region" aria-label="Widgets">
      <div className="widget-header">
        <span className="widget-title">Widgets</span>
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

      <div className={`widget-area widget-area-${view}`}>
        {WIDGETS.map((w) => (
          <div key={w.key} className="widget-cell">
            <span className="widget-icon">
              <w.Icon size={20} />
            </span>
            <span className="widget-meta">
              <span className="widget-name">{w.name}</span>
              <span className="widget-desc">{w.desc}</span>
            </span>
            <span className="widget-preview">—</span>
          </div>
        ))}
        <button
          type="button"
          className="widget-add"
          disabled
          title="Custom widgets are planned — this area is a preview."
        >
          <Plus size={18} />
          Add widget (coming soon)
        </button>
      </div>
    </section>
  )
}
