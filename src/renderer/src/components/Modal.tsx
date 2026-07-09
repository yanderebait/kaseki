import { useEscapeLayer } from '../hooks/useEscapeLayer'

// Centered modal chrome (Part 3: max-width 560px, 16px radius). Dismisses
// on Escape or backdrop click. Reused by the create-space affordance and
// the settings panel. Escape goes through the shared layer stack, so a modal
// stacked over another surface (a viewer, the vault) closes alone instead of
// taking everything beneath it down too.
export default function Modal({
  title,
  onClose,
  children
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}): React.JSX.Element {
  useEscapeLayer(true, onClose)

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
