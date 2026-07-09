import { useEffect, useRef } from 'react'

// One Escape, one layer (v0.2.0). Every overlay previously attached its own
// window-level keydown listener, so with overlays stacked — a modal over the
// document viewer, the find bar over the PDF, a rename input inside the vault
// — a single Escape fired them all and collapsed the entire stack. This hook
// keeps a module-level stack of open layers and routes Escape to the top one
// only.
//
// Usage: useEscapeLayer(active, onClose). While `active`, the layer sits on
// the stack in mount order; Escape closes the most recent active layer and
// stops there. Inputs that handle Escape themselves (e.g. to cancel an inline
// rename) should register as a layer while editing instead of relying on
// their own keydown — the stack listener runs in the capture phase and would
// otherwise win.

interface Layer {
  id: number
  close: () => void
}

const stack: Layer[] = []
let nextId = 1
let listening = false

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  const top = stack[stack.length - 1]
  if (!top) return
  e.preventDefault()
  e.stopPropagation()
  top.close()
}

function ensureListener(): void {
  if (listening) return
  window.addEventListener('keydown', onKeyDown, true)
  listening = true
}

export function useEscapeLayer(active: boolean, close: () => void): void {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!active) return
    ensureListener()
    const layer: Layer = { id: nextId++, close: () => closeRef.current() }
    stack.push(layer)
    return () => {
      const i = stack.indexOf(layer)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [active])
}

// True when a keyboard event targets a place the user is typing — the shared
// guard for global shortcuts (single-letter keys were previously hijacked
// while typing in the PDF find bar and similar inputs).
export function isEditingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  )
}
