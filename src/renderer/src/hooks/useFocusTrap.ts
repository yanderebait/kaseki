import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

// Traps Tab focus inside a modal and restores focus to the trigger on close
// (WCAG 2.4.3 / 2.1.2). Attach the returned ref to the modal panel. On open,
// focus moves inside (unless the component already focused something); Tab and
// Shift+Tab cycle within; on unmount, the previously-focused element regains
// focus. The panel is made programmatically focusable so an empty modal can
// still hold focus.
export function useFocusTrap<T extends HTMLElement>(): React.RefObject<T | null> {
  const ref = useRef<T>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1')

    const focusable = (): HTMLElement[] =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)

    if (!node.contains(document.activeElement)) {
      const first = focusable()[0]
      ;(first ?? node).focus()
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) {
        e.preventDefault()
        node.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    node.addEventListener('keydown', onKey)
    return () => {
      node.removeEventListener('keydown', onKey)
      // Restore focus only if it's still inside the closing modal (otherwise
      // something else has legitimately taken it).
      if (node.contains(document.activeElement)) previouslyFocused?.focus?.()
    }
  }, [])
  return ref
}
