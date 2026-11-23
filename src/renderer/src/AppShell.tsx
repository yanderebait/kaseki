import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import Home from './screens/Home'
import Dashboard from './screens/Dashboard'
import Orb from './components/Orb'
// The viewer pulls pdf.js and the knowledge area pulls Tiptap — both heavy and
// only needed on demand, so they're code-split out of the initial bundle.
const DocumentViewer = lazy(() => import('./components/viewer/DocumentViewer'))
const BundlesManager = lazy(() => import('./components/viewer/BundlesManager'))
const KnowledgeArea = lazy(() => import('./components/knowledge/KnowledgeArea'))
const SensitiveFolder = lazy(() => import('./components/vault/SensitiveFolder'))
import SearchPalette, { type Command } from './components/search/SearchPalette'
import QuickCapture from './components/QuickCapture'
import ProfessionSearch from './components/ProfessionSearch'
import Settings from './components/Settings'
import ShortcutsHelp from './components/ShortcutsHelp'
import OrbAnnouncer from './components/OrbAnnouncer'
import Tour from './components/Tour'
import type { CalendarEvent, SearchHit, Space, Task } from '../../shared/types'
import EventModal from './components/EventModal'
import ErrorBoundary from './components/ErrorBoundary'
import { useOrb } from './orbState'
import { useTheme } from './theme'
import { PomodoroProvider } from './pomodoro'

export type View = { name: 'home' } | { name: 'dashboard'; spaceId: number; openTaskId?: number }
type ViewerState = { fileId: number; bundleId?: number }
type KnowledgeState = { pageId?: number }

// The unlocked app: home <-> dashboard navigation, the persistent Orb, the
// document viewer overlay, the bundles manager, the knowledge area, and the
// sensitive folder. Cmd+O picks a file; the Orb's items open bundles, the
// personal wiki, and the sensitive folder; Cmd+L locks the sensitive folder.
// `initialView` lets onboarding open straight onto the new space's dashboard;
// `startTour` kicks off the guided tour once the dashboard is showing.
export default function AppShell({
  initialView = { name: 'home' },
  startTour = false,
  showTip = false
}: {
  initialView?: View
  startTour?: boolean
  showTip?: boolean
}): React.JSX.Element {
  const [view, setView] = useState<View>(initialView)
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const [bundlesOpen, setBundlesOpen] = useState(false)
  const [knowledge, setKnowledge] = useState<KnowledgeState | null>(null)
  const [sensitiveOpen, setSensitiveOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [spaceCreateOpen, setSpaceCreateOpen] = useState(false)
  const [settingsCategory, setSettingsCategory] = useState<string | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [spaces, setSpaces] = useState<Space[]>([])
  const [homeKey, setHomeKey] = useState(0)
  const [tourOpen, setTourOpen] = useState(false)
  // A search-hit event opens the edit modal right here at the shell — 0.1.0
  // routed to the space dashboard and left the user to find the event by eye
  // (and Global events routed to home with nothing at all).
  const [eventEdit, setEventEdit] = useState<CalendarEvent | null>(null)
  const [eventReload, setEventReload] = useState(0)
  const [sensitiveFileId, setSensitiveFileId] = useState<number | null>(null)
  const { rest, flash, say } = useOrb()
  const { toggle: toggleTheme } = useTheme()
  const tipShown = useRef(false)

  // The space list backs Cmd+1–9 (jump to the Nth space); refresh it when a new
  // space is created (the same signal that remounts home).
  useEffect(() => {
    window.kaseki.spaces.list().then(setSpaces)
  }, [homeKey])

  useEffect(() => {
    if (startTour) setTourOpen(true)
  }, [startTour])

  // The Orb wears the tour expression while the tour runs, then returns to idle.
  useEffect(() => {
    rest(tourOpen ? 'tour' : 'idle')
  }, [tourOpen, rest])

  // After onboarding settles (legal accepted, tour finished), the Orb offers the
  // one-time settings tip from its speech bubble (Part 12).
  useEffect(() => {
    if (!showTip || tourOpen || tipShown.current) return
    tipShown.current = true
    const t = setTimeout(
      () => say({ body: 'And we’re all set! If you ever want settings, just give me a tap.' }),
      1200
    )
    return () => clearTimeout(t)
  }, [showTip, tourOpen, say])

  const openFile = useCallback(async () => {
    const file = await window.kaseki.files.pick()
    if (file) setViewer({ fileId: file.id })
  }, [])

  const openBundle = useCallback(async (bundleId: number) => {
    const bundle = await window.kaseki.bundles.get(bundleId)
    if (bundle && bundle.files.length > 0) {
      setViewer({ fileId: bundle.files[0].id, bundleId })
      setBundlesOpen(false)
    }
  }, [])

  // Route a chosen search result to the surface that shows it (Part 15). Tasks
  // and subtasks open their space's dashboard with the slide-out; events route
  // to their space's calendar (the dashboard, or the home strip when Global).
  const openHit = useCallback(
    (hit: SearchHit) => {
      setSearchOpen(false)
      switch (hit.type) {
        case 'task':
          if (hit.spaceId != null) setView({ name: 'dashboard', spaceId: hit.spaceId, openTaskId: hit.id })
          break
        case 'subtask':
          if (hit.spaceId != null)
            setView({ name: 'dashboard', spaceId: hit.spaceId, openTaskId: hit.parentId ?? hit.id })
          break
        case 'space':
          setView({ name: 'dashboard', spaceId: hit.id })
          break
        case 'event':
          setView(hit.spaceId != null ? { name: 'dashboard', spaceId: hit.spaceId } : { name: 'home' })
          window.kaseki.events.get(hit.id).then((ev) => {
            if (ev) setEventEdit(ev)
          })
          break
        case 'file':
          setViewer({ fileId: hit.id })
          break
        case 'bundle':
          openBundle(hit.id)
          break
        case 'knowledge':
          setKnowledge({ pageId: hit.id })
          break
        case 'vault':
          setSensitiveFileId(hit.id)
          setSensitiveOpen(true)
          break
      }
    },
    [openBundle]
  )

  // A newly captured task: surface it by opening its dashboard + slide-out.
  const onTaskCreated = useCallback((task: Task) => {
    setQuickOpen(false)
    setView({ name: 'dashboard', spaceId: task.spaceId, openTaskId: task.id })
  }, [])

  // Command-palette actions (Part 15). New space opens the profession search;
  // switch/new-task/viewer/theme reuse the existing handlers.
  const onCommand = useCallback(
    (cmd: Command) => {
      setSearchOpen(false)
      switch (cmd.kind) {
        case 'new-task':
          setQuickOpen(true)
          break
        case 'new-space':
          setSpaceCreateOpen(true)
          break
        case 'switch-space':
          setView({ name: 'dashboard', spaceId: cmd.spaceId })
          break
        case 'open-viewer':
          openFile()
          break
        case 'toggle-theme':
          toggleTheme()
          break
        case 'show-shortcuts':
          setShortcutsOpen(true)
          break
      }
    },
    [openFile, toggleTheme]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      const el = e.target as HTMLElement | null
      const editing =
        el?.tagName === 'INPUT' ||
        el?.tagName === 'TEXTAREA' ||
        el?.tagName === 'SELECT' ||
        el?.isContentEditable === true
      // The two text-capturing modals suppress the other global shortcuts.
      const blocked = searchOpen || quickOpen
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((o) => !o)
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault()
        toggleTheme()
      } else if (mod && e.key === ',' && !blocked) {
        e.preventDefault()
        setSettingsCategory('General')
      } else if (mod && e.key === '/' && !blocked) {
        e.preventDefault()
        setShortcutsOpen((o) => !o)
      } else if (mod && e.key.toLowerCase() === 'h' && !blocked) {
        e.preventDefault()
        setView({ name: 'home' })
      } else if (mod && !e.shiftKey && e.key >= '1' && e.key <= '9' && !blocked) {
        // Cmd+1–9 jumps to the Nth profession space.
        e.preventDefault()
        const target = spaces[Number(e.key) - 1]
        if (target) setView({ name: 'dashboard', spaceId: target.id })
      } else if (!mod && e.shiftKey && e.key.toLowerCase() === 'n' && !editing && !blocked) {
        // Quick capture from anywhere (Part 15), unless typing in a field.
        e.preventDefault()
        setQuickOpen(true)
      } else if (mod && e.key.toLowerCase() === 'o' && !blocked) {
        e.preventDefault()
        openFile()
      } else if (mod && e.key.toLowerCase() === 'l' && !sensitiveOpen && !blocked) {
        // Cmd+L locks the sensitive folder even when its overlay is closed
        // (Part 17 / shortcuts). When the overlay is open it handles its own.
        e.preventDefault()
        window.kaseki.vault.lock()
        flash('locked')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openFile, sensitiveOpen, searchOpen, quickOpen, spaces, flash, toggleTheme])

  return (
    <ErrorBoundary>
      <PomodoroProvider>
      {view.name === 'home' ? (
        <Home
          key={homeKey}
          onOpenSpace={(spaceId) => setView({ name: 'dashboard', spaceId })}
          onOpenKnowledge={() => setKnowledge({})}
          onOpenTask={(spaceId, taskId) => setView({ name: 'dashboard', spaceId, openTaskId: taskId })}
          onOpenSettings={setSettingsCategory}
        />
      ) : (
        <Dashboard
          spaceId={view.spaceId}
          requestedTaskId={view.openTaskId}
          eventReload={eventReload}
          onBack={() => setView({ name: 'home' })}
          onOpenFile={(fileId) => setViewer({ fileId })}
          onSpaceGone={() => {
            setHomeKey((k) => k + 1)
            setView({ name: 'home' })
          }}
        />
      )}
      <Orb
        onOpenFile={openFile}
        onOpenBundles={() => setBundlesOpen(true)}
        onOpenKnowledge={() => setKnowledge({})}
        onOpenSensitive={() => setSensitiveOpen(true)}
        onStartTour={() => setTourOpen(true)}
        onOpenSettings={setSettingsCategory}
      />
      <Suspense fallback={null}>
        {viewer && (
          <DocumentViewer
            fileId={viewer.fileId}
            bundleId={viewer.bundleId}
            onClose={() => setViewer(null)}
          />
        )}
        {bundlesOpen && (
          <BundlesManager onOpenBundle={openBundle} onClose={() => setBundlesOpen(false)} />
        )}
        {knowledge && (
          <KnowledgeArea initialPageId={knowledge.pageId} onClose={() => setKnowledge(null)} />
        )}
        {sensitiveOpen && (
          <SensitiveFolder
            initialFileId={sensitiveFileId ?? undefined}
            onClose={() => {
              setSensitiveOpen(false)
              setSensitiveFileId(null)
            }}
          />
        )}
      </Suspense>
      {searchOpen && (
        <SearchPalette onClose={() => setSearchOpen(false)} onSelect={openHit} onCommand={onCommand} />
      )}
      {quickOpen && (
        <QuickCapture
          defaultSpaceId={view.name === 'dashboard' ? view.spaceId : undefined}
          onClose={() => setQuickOpen(false)}
          onCreated={onTaskCreated}
        />
      )}
      {spaceCreateOpen && (
        <ProfessionSearch
          onClose={() => setSpaceCreateOpen(false)}
          onCreated={() => {
            setSpaceCreateOpen(false)
            setHomeKey((k) => k + 1)
            setView({ name: 'home' })
          }}
        />
      )}
      {settingsCategory && (
        <Settings initial={settingsCategory} onClose={() => setSettingsCategory(null)} />
      )}
      {shortcutsOpen && <ShortcutsHelp onClose={() => setShortcutsOpen(false)} />}
      {eventEdit && (
        <EventModal
          event={eventEdit}
          onClose={() => setEventEdit(null)}
          onSaved={() => {
            // Nudge whichever calendar is showing to refetch.
            setEventReload((n) => n + 1)
            setHomeKey((k) => k + 1)
          }}
        />
      )}
      {tourOpen && <Tour onClose={() => setTourOpen(false)} />}
      <OrbAnnouncer />
      </PomodoroProvider>
    </ErrorBoundary>
  )
}
