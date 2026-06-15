import { useEffect } from 'react'

// Centered modal chrome (Part 3: max-width 560px, 16px radius). Dismisses
// on Escape or backdrop click. Reused by the create-space affordance and
// the settings panel.
export default function Modal({
  title,
  onClose,
  children
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">{title}</header>
        {children}
      </div>
    </div>
  )
}
