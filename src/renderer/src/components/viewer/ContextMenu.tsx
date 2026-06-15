import { useEffect } from 'react'

export interface ContextItem {
  label: string
  onClick: () => void
  disabled?: boolean
}

// A positioned right-click menu (Part 9). Closes on Escape, outside click,
// or another right-click.
export default function ContextMenu({
  x,
  y,
  items,
  onClose
}: {
  x: number
  y: number
  items: ContextItem[]
  onClose: () => void
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div
        className="ctx-backdrop"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div className="ctx-menu" style={{ left: x, top: y }}>
        {items.map((item, i) => (
          <button
            key={i}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onClick()
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}
