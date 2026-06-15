import { useCallback, useEffect, useState } from 'react'
import Modal from '../Modal'
import { ChevronRight } from '../../icons'
import type { Bundle } from '../../../../shared/types'

// Manages document bundles (Part 9). Opened from the Orb menu since there
// are no tasks/matters to create them from yet. Create a bundle, open one
// (its files become the viewer's scope), or delete it. Files are added from
// the viewer's ⋯ menu.
export default function BundlesManager({
  onOpenBundle,
  onClose
}: {
  onOpenBundle: (id: number) => void
  onClose: () => void
}): React.JSX.Element {
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [newName, setNewName] = useState('')

  const refresh = useCallback(() => {
    window.kaseki.bundles.list().then(setBundles)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function create(): Promise<void> {
    if (newName.trim().length === 0) return
    await window.kaseki.bundles.create(newName.trim())
    setNewName('')
    refresh()
  }

  return (
    <Modal title="Document bundles" onClose={onClose}>
      <div className="bundle-list">
        {bundles.map((b) => (
          <div key={b.id} className="bundle-row">
            <button
              type="button"
              className="bundle-open"
              disabled={b.fileCount === 0}
              onClick={() => onOpenBundle(b.id)}
            >
              <span className="bundle-name">{b.name}</span>
              <span className="bundle-count">
                {b.fileCount} {b.fileCount === 1 ? 'file' : 'files'}
              </span>
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className="row-remove"
              aria-label="Delete bundle"
              onClick={() => window.kaseki.bundles.delete(b.id).then(refresh)}
            >
              ×
            </button>
          </div>
        ))}
        {bundles.length === 0 && (
          <p className="hint">No bundles yet. Create one, then add files from the viewer&apos;s ⋯ menu.</p>
        )}
      </div>
      <div className="bundle-add">
        <input
          type="text"
          placeholder="New bundle name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') create()
          }}
        />
        <button type="button" className="primary" disabled={newName.trim().length === 0} onClick={create}>
          Create
        </button>
      </div>
    </Modal>
  )
}
