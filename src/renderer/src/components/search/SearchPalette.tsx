import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { SearchHit, SearchHitType, Space } from '../../../../shared/types'
import { useOrb } from '../../orbState'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { ChevronRight, Search } from '../../icons'

const TYPE_LABELS: Record<SearchHitType, string> = {
  task: 'Tasks',
  subtask: 'Subtasks',
  event: 'Events',
  knowledge: 'Knowledge',
  file: 'Files',
  bundle: 'Bundles',
  space: 'Spaces',
  vault: 'Sensitive folder'
}

// The order groups appear in (and so the order ↑/↓ and Tab walk them).
const TYPE_ORDER: SearchHitType[] = ['task', 'subtask', 'event', 'knowledge', 'file', 'bundle', 'space', 'vault']

// A command-palette action (Part 15). Routed to AppShell, which holds the
// handlers. Only actions with a live target are offered; "Show shortcuts" and
// "Export all data" wait for the help overlay and backup (later phases).
export type Command =
  | { kind: 'new-task' }
  | { kind: 'new-space' }
  | { kind: 'switch-space'; spaceId: number }
  | { kind: 'open-viewer' }
  | { kind: 'toggle-theme' }
  | { kind: 'show-shortcuts' }

interface CommandItem {
  id: string
  label: string
  run: () => void
}

// The Cmd+K palette (Part 15). Plain text searches content; a leading ">"
// switches to command mode. Debounced query against the aggregator; results
// grouped by type with the owning space's accent. Full keyboard control (↑/↓
// move, Enter run/open, Tab/Shift+Tab jump group, Esc close). The Orb wears its
// searching face while open.
export default function SearchPalette({
  onClose,
  onSelect,
  onCommand
}: {
  onClose: () => void
  onSelect: (hit: SearchHit) => void
  onCommand: (cmd: Command) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [spaces, setSpaces] = useState<Space[]>([])
  const [active, setActive] = useState(0)
  const { rest } = useOrb()
  const trapRef = useFocusTrap<HTMLDivElement>()
  const inputRef = useRef<HTMLInputElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  const isCommand = query.trimStart().startsWith('>')

  useEffect(() => {
    rest('searching')
    return () => rest('idle')
  }, [rest])

  useEffect(() => {
    inputRef.current?.focus()
    window.kaseki.spaces.list().then(setSpaces)
  }, [])

  // Debounced content search (skipped in command mode and for sub-2-char input).
  useEffect(() => {
    const q = query.trim()
    if (q.startsWith('>') || q.length < 2) {
      setHits([])
      setActive(0)
      return
    }
    const t = setTimeout(() => {
      window.kaseki.search.query(q).then((r) => {
        setHits(r)
        setActive(0)
      })
    }, 120)
    return () => clearTimeout(t)
  }, [query])

  // Flatten search hits in display order; remember group starts for Tab.
  const { flat, groupStarts } = useMemo(() => {
    const byType = new Map<SearchHitType, SearchHit[]>()
    for (const h of hits) {
      const arr = byType.get(h.type) ?? []
      arr.push(h)
      byType.set(h.type, arr)
    }
    const flatHits: SearchHit[] = []
    const starts: number[] = []
    for (const t of TYPE_ORDER) {
      const items = byType.get(t)
      if (!items) continue
      starts.push(flatHits.length)
      flatHits.push(...items)
    }
    return { flat: flatHits, groupStarts: starts }
  }, [hits])

  const commands = useMemo<CommandItem[]>(
    () => [
      { id: 'new-task', label: 'New task', run: () => onCommand({ kind: 'new-task' }) },
      { id: 'new-space', label: 'New space', run: () => onCommand({ kind: 'new-space' }) },
      { id: 'open-viewer', label: 'Open document viewer', run: () => onCommand({ kind: 'open-viewer' }) },
      { id: 'toggle-theme', label: 'Toggle theme', run: () => onCommand({ kind: 'toggle-theme' }) },
      { id: 'show-shortcuts', label: 'Show keyboard shortcuts', run: () => onCommand({ kind: 'show-shortcuts' }) },
      ...spaces.map((s) => ({
        id: `switch-${s.id}`,
        label: `Switch to ${s.name}`,
        run: () => onCommand({ kind: 'switch-space', spaceId: s.id })
      }))
    ],
    [spaces, onCommand]
  )

  const filteredCommands = useMemo(() => {
    if (!isCommand) return []
    const cq = query.trimStart().slice(1).trim().toLowerCase()
    return cq ? commands.filter((c) => c.label.toLowerCase().includes(cq)) : commands
  }, [isCommand, query, commands])

  const count = isCommand ? filteredCommands.length : flat.length

  useEffect(() => {
    if (active >= count) setActive(0)
  }, [count, active])

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function jumpGroup(dir: 1 | -1): void {
    if (groupStarts.length === 0) return
    let g = 0
    for (let i = 0; i < groupStarts.length; i++) if (groupStarts[i] <= active) g = i
    const next = (g + dir + groupStarts.length) % groupStarts.length
    setActive(groupStarts[next])
  }

  function activate(idx: number): void {
    if (isCommand) filteredCommands[idx]?.run()
    else if (flat[idx]) onSelect(flat[idx])
  }

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, count - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      activate(active)
    } else if (e.key === 'Tab' && !isCommand) {
      e.preventDefault()
      jumpGroup(e.shiftKey ? -1 : 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const q = query.trim()
  const activeId = count > 0 ? `search-opt-${active}` : undefined
  const countMessage = isCommand
    ? `${filteredCommands.length} command${filteredCommands.length === 1 ? '' : 's'}`
    : q.length < 2
      ? ''
      : flat.length === 0
        ? 'No results'
        : `${flat.length} result${flat.length === 1 ? '' : 's'}`

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={trapRef}
        className="search-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search Kaseki"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="search-palette-input">
          <Search size={18} />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={count > 0}
            aria-controls="search-listbox"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label="Search Kaseki"
            placeholder="Search across Kaseki…  (type > for commands)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {countMessage}
        </p>

        <div className="search-results" id="search-listbox" role="listbox" aria-label="Search results">
          {isCommand ? (
            filteredCommands.length === 0 ? (
              <p className="hint search-empty">No matching commands.</p>
            ) : (
              <>
                <div className="search-group-label" role="presentation">
                  Commands
                </div>
                {filteredCommands.map((c, idx) => (
                  <button
                    key={c.id}
                    id={`search-opt-${idx}`}
                    ref={idx === active ? activeRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={idx === active}
                    className={`search-row${idx === active ? ' active' : ''}`}
                    onMouseMove={() => setActive(idx)}
                    onClick={() => c.run()}
                  >
                    <span className="search-row-cmd">
                      <ChevronRight size={14} />
                      {c.label}
                    </span>
                  </button>
                ))}
              </>
            )
          ) : q.length < 2 ? (
            <p className="hint search-empty">Type at least two characters, or “&gt;” for commands.</p>
          ) : flat.length === 0 ? (
            <p className="hint search-empty">No results for “{q}”.</p>
          ) : (
            flat.map((h, idx) => {
              const header = idx === 0 || flat[idx - 1].type !== h.type
              return (
                <Fragment key={`${h.type}-${h.id}`}>
                  {header && (
                    <div className="search-group-label" role="presentation">
                      {TYPE_LABELS[h.type]}
                    </div>
                  )}
                  <button
                    id={`search-opt-${idx}`}
                    ref={idx === active ? activeRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={idx === active}
                    className={`search-row${idx === active ? ' active' : ''}`}
                    onMouseMove={() => setActive(idx)}
                    onClick={() => onSelect(h)}
                  >
                    <span className="search-row-main">
                      <span className="search-row-title">{h.title}</span>
                      {h.snippet && <span className="search-row-snippet">{h.snippet}</span>}
                    </span>
                    {h.spaceName && (
                      <span className="search-row-space">
                        <span
                          className="search-row-dot"
                          style={{ background: h.accentColor ?? 'var(--accent)' }}
                        />
                        {h.spaceName}
                      </span>
                    )}
                  </button>
                </Fragment>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
