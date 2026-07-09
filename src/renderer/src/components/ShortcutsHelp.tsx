import { useFocusTrap } from '../hooks/useFocusTrap'
import { useEscapeLayer } from '../hooks/useEscapeLayer'

// The modifier reads as ⌘ on macOS, Ctrl elsewhere — the handlers accept both
// (metaKey || ctrlKey), so this is purely how we label them.
const MOD = navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl'

interface Shortcut {
  keys: string
  action: string
}
interface ShortcutGroup {
  title: string
  items: Shortcut[]
}

// Only the shortcuts that are actually bound today (Part 15 + the global set
// from this phase, plus the viewer and vault bindings). Aspirational entries
// from Appendix B that aren't wired yet are deliberately left out so the help
// never lies.
const GROUPS: ShortcutGroup[] = [
  {
    title: 'Global',
    items: [
      { keys: `${MOD}+K`, action: 'Open global search' },
      { keys: `${MOD}+H`, action: 'Return to the home screen' },
      { keys: `${MOD}+,`, action: 'Open settings' },
      { keys: `${MOD}+/`, action: 'Keyboard shortcuts (this)' },
      { keys: 'Shift+N', action: 'Quick capture a task' },
      { keys: `${MOD}+1…9`, action: 'Jump to a profession space' },
      { keys: `${MOD}+Shift+T`, action: 'Toggle dark / light theme' },
      { keys: `${MOD}+O`, action: 'Open a file in the viewer' },
      { keys: 'Esc', action: 'Close the current modal' }
    ]
  },
  {
    title: 'Document viewer',
    items: [
      { keys: `${MOD}+F`, action: 'Find within the document' },
      { keys: `${MOD}+P`, action: 'Print' }
    ]
  },
  {
    title: 'Sensitive folder',
    items: [{ keys: `${MOD}+L`, action: 'Lock immediately' }]
  }
]

// Splits a "Cmd+Shift+T" string into individual <kbd> chips.
function Keys({ combo }: { combo: string }): React.JSX.Element {
  return (
    <span className="shortcut-keys">
      {combo.split('+').map((k, i) => (
        <kbd key={i}>{k}</kbd>
      ))}
    </span>
  )
}

// The list itself — reused by the Cmd+/ overlay and Settings → Keyboard
// shortcuts.
export function ShortcutsList(): React.JSX.Element {
  return (
    <div className="shortcuts-list">
      {GROUPS.map((g) => (
        <div key={g.title} className="shortcut-group">
          <h3 className="shortcut-group-title">{g.title}</h3>
          {g.items.map((s) => (
            <div key={s.action} className="shortcut-row">
              <Keys combo={s.keys} />
              <span className="shortcut-action">{s.action}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function ShortcutsHelp({ onClose }: { onClose: () => void }): React.JSX.Element {
  const trapRef = useFocusTrap<HTMLDivElement>()
  useEscapeLayer(true, onClose)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={trapRef}
        className="shortcuts"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="shortcuts-heading">Keyboard shortcuts</h2>
        <ShortcutsList />
      </div>
    </div>
  )
}
