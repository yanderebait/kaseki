import { useLayoutEffect, useRef, useState } from 'react'
import { useTheme } from '../theme'
import { useOrb, clampPos, ORB, PAD, type Pos } from '../orbState'
import { Settings as SettingsIcon } from '../icons'
import OrbFace from './OrbFace'
import SpeechBubble from './SpeechBubble'

// The Orb (Part 12): the personality element in the corner. Draggable (snaps to
// an edge within 20px, position persisted), left-click opens the menu, right-
// click opens a context menu (move to corner / reset / hide / settings). Hiding
// persists; while hidden a gear in the corner keeps settings reachable. Position,
// hidden, and intensity live in OrbProvider so Settings shares them.

const SNAP = 20
const MOVE = 4

// Snap to an edge when released within SNAP of it (each axis independently).
const snapPos = (p: Pos): Pos => {
  let { x, y } = p
  if (x <= SNAP) x = PAD
  else if (x >= window.innerWidth - ORB - SNAP) x = window.innerWidth - ORB - PAD
  if (y <= SNAP) y = PAD
  else if (y >= window.innerHeight - ORB - SNAP) y = window.innerHeight - ORB - PAD
  return { x, y }
}

// Anchor a menu to the Orb's nearest corner, opening inward.
const menuStyle = (p: Pos): React.CSSProperties => {
  const s: React.CSSProperties = { top: 'auto', bottom: 'auto', left: 'auto', right: 'auto' }
  if (p.y < window.innerHeight / 2) s.top = p.y + ORB + 8
  else s.bottom = window.innerHeight - p.y + 8
  if (p.x + ORB / 2 > window.innerWidth / 2) s.right = window.innerWidth - (p.x + ORB)
  else s.left = p.x
  return s
}

const cornerPos = (c: 'tl' | 'tr' | 'bl' | 'br'): Pos => {
  const right = window.innerWidth - ORB - PAD
  const bottom = window.innerHeight - ORB - PAD
  return { tl: { x: PAD, y: PAD }, tr: { x: right, y: PAD }, bl: { x: PAD, y: bottom }, br: { x: right, y: bottom } }[c]
}

// Anchor the speech bubble to the Orb's real rendered rect (read after layout),
// using the document client size — robust against window dimensions not being
// settled when an early bubble fires.
const bubbleStyle = (r: DOMRect): React.CSSProperties => {
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight
  const s: React.CSSProperties = { top: 'auto', bottom: 'auto', left: 'auto', right: 'auto' }
  if (r.top < vh / 2) s.top = r.bottom + 8
  else s.bottom = vh - r.top + 8
  if (r.left + r.width / 2 > vw / 2) s.right = vw - r.right
  else s.left = r.left
  return s
}

export default function Orb({
  onOpenFile,
  onOpenBundles,
  onOpenKnowledge,
  onOpenSensitive,
  onStartTour,
  onOpenSettings
}: {
  onOpenFile: () => void
  onOpenBundles: () => void
  onOpenKnowledge: () => void
  onOpenSensitive: () => void
  onStartTour: () => void
  onOpenSettings: (category: string) => void
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [ctxOpen, setCtxOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dragDir, setDragDir] = useState(0)
  const { toggle } = useTheme()
  const { state, flash, pos, setPos, commitPos, hidden, setHidden, speech, say } = useOrb()
  const drag = useRef<{ ox: number; oy: number; sx: number; sy: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const orbRef = useRef<HTMLButtonElement>(null)
  const [speechStyle, setSpeechStyle] = useState<React.CSSProperties>()

  // Position the speech bubble from the Orb's actual rect whenever it appears,
  // re-measuring after a frame and on resize so it stays anchored even if layout
  // wasn't settled when it fired.
  useLayoutEffect(() => {
    if (!speech) return
    const measure = (): void => {
      if (orbRef.current) setSpeechStyle(bubbleStyle(orbRef.current.getBoundingClientRect()))
    }
    measure()
    const raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
    }
  }, [speech, pos])

  // Menus follow a saved position; with none, the CSS default (.orb-menu pinned
  // to the bottom-right corner) places them, matching the Orb's CSS default.
  const menuPos = pos ? menuStyle(pos) : undefined

  function onPointerDown(e: React.PointerEvent): void {
    const rect = e.currentTarget.getBoundingClientRect()
    const start = pos ?? { x: rect.left, y: rect.top }
    if (!pos) setPos(start)
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { ox: e.clientX - start.x, oy: e.clientY - start.y, sx: e.clientX, sy: e.clientY, moved: false }
  }

  function onPointerMove(e: React.PointerEvent): void {
    const d = drag.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > MOVE) {
      d.moved = true
      setDragging(true)
      setMenuOpen(false)
    }
    if (d.moved) {
      setDragDir(Math.sign(e.clientX - d.sx))
      setPos(clampPos({ x: e.clientX - d.ox, y: e.clientY - d.oy }))
    }
  }

  function onPointerUp(): void {
    const moved = drag.current?.moved
    drag.current = null
    if (!moved) return
    suppressClick.current = true
    setDragging(false)
    setDragDir(0)
    commitPos(pos ? snapPos(pos) : null)
  }

  function onClick(): void {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    flash('tap')
    setCtxOpen(false)
    setMenuOpen((o) => !o)
  }

  function onContextMenu(e: React.MouseEvent): void {
    e.preventDefault()
    setMenuOpen(false)
    setCtxOpen((o) => !o)
  }

  function openSettings(category: string): void {
    onOpenSettings(category)
    setMenuOpen(false)
    setCtxOpen(false)
  }

  function moveCorner(c: 'tl' | 'tr' | 'bl' | 'br'): void {
    commitPos(cornerPos(c))
    setCtxOpen(false)
  }

  return (
    <>
      {!hidden && (
        <>
          <button
            ref={orbRef}
            type="button"
            className={`orb${dragging ? ' dragging' : ''}`}
            data-orb-state={dragging ? 'drag' : state}
            style={
              {
                ...(pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : null),
                '--orb-drag-x': `${dragDir * 2}px`
              } as React.CSSProperties
            }
            aria-label="Open Kaseki menu"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={onClick}
            onContextMenu={onContextMenu}
          >
            <OrbFace />
          </button>

          {menuOpen && (
            <>
              <div className="orb-menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="orb-menu" role="menu" style={menuPos}>
                <button type="button" onClick={() => openSettings('General')}>
                  Settings
                </button>
                <div className="orb-menu-divider" />
                <button
                  type="button"
                  onClick={() => {
                    onOpenFile()
                    setMenuOpen(false)
                  }}
                >
                  Open file…
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenBundles()
                    setMenuOpen(false)
                  }}
                >
                  Bundles…
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenKnowledge()
                    setMenuOpen(false)
                  }}
                >
                  Knowledge…
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenSensitive()
                    setMenuOpen(false)
                  }}
                >
                  Sensitive folder…
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onStartTour()
                    setMenuOpen(false)
                  }}
                >
                  Take a tour
                </button>
                <div className="orb-menu-divider" />
                <button type="button" onClick={() => openSettings('Keyboard shortcuts')}>
                  Help / Keyboard shortcuts
                </button>
                <button type="button" onClick={() => openSettings('About')}>
                  About Kaseki
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toggle()
                    setMenuOpen(false)
                  }}
                >
                  Switch theme
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHidden(true)
                    setMenuOpen(false)
                  }}
                >
                  Hide Orb
                </button>
              </div>
            </>
          )}

          {ctxOpen && (
            <>
              <div
                className="orb-menu-backdrop"
                onClick={() => setCtxOpen(false)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setCtxOpen(false)
                }}
              />
              <div className="orb-menu" role="menu" style={menuPos}>
                <span className="orb-ctx-label">Move to corner</span>
                <div className="orb-ctx-corners">
                  <button type="button" aria-label="Top-left" onClick={() => moveCorner('tl')}>
                    ↖
                  </button>
                  <button type="button" aria-label="Top-right" onClick={() => moveCorner('tr')}>
                    ↗
                  </button>
                  <button type="button" aria-label="Bottom-left" onClick={() => moveCorner('bl')}>
                    ↙
                  </button>
                  <button type="button" aria-label="Bottom-right" onClick={() => moveCorner('br')}>
                    ↘
                  </button>
                </div>
                <div className="orb-menu-divider" />
                <button
                  type="button"
                  onClick={() => {
                    commitPos(null)
                    setCtxOpen(false)
                  }}
                >
                  Reset position
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHidden(true)
                    setCtxOpen(false)
                  }}
                >
                  Hide Orb
                </button>
                <button type="button" onClick={() => openSettings('Orb')}>
                  Settings
                </button>
              </div>
            </>
          )}

          {speech && (
            <SpeechBubble
              style={speechStyle}
              orbState="welcome"
              title={speech.title}
              body={speech.body}
              onClick={() => say(null)}
            />
          )}
        </>
      )}

      {hidden && (
        <button
          type="button"
          className="orb-gear"
          aria-label="Settings"
          title="Settings"
          onClick={() => openSettings('General')}
        >
          <SettingsIcon size={18} />
        </button>
      )}
    </>
  )
}
