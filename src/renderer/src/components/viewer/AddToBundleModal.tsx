import { useCallback, useEffect, useState } from 'react'
import Modal from '../Modal'
import type { Bundle } from '../../../../shared/types'

// Adds the current file to an existing or new bundle (from the viewer's ⋯
// menu).
export default function AddToBundleModal({
  fileId,
  onClose
}: {
  fileId: number
  onClose: () => void
}): React.JSX.Element {
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [newName, setNewName] = useState('')
  const [added, setAdded] = useState<string | null>(null)

  const refresh = useCallback(() => {
    window.kaseki.bundles.list().then(setBundles)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function addTo(bundleId: number, name: string): Promise<void> {
    await window.kaseki.bundles.addFile(bundleId, fileId)
    setAdded(name)
    refresh()
  }

  async function createAndAdd(): Promise<void> {
    if (newName.trim().length === 0) return
    const bundle = await window.kaseki.bundles.create(newName.trim())
    await window.kaseki.bundles.addFile(bundle.id, fileId)
    setNewName('')
    setAdded(bundle.name)
    refresh()
  }

  return (
    <Modal title="Add to bundle" onClose={onClose}>
      {added && <p className="hint">Added to “{added}”.</p>}
      <div className="bundle-list">
        {bundles.map((b) => (
          <button key={b.id} type="button" className="bundle-pick" onClick={() => addTo(b.id, b.name)}>
            <span className="bundle-name">{b.name}</span>
            <span className="bundle-count">{b.fileCount}</span>
          </button>
        ))}
        {bundles.length === 0 && <p className="hint">No bundles yet — create one below.</p>}
      </div>
      <div className="bundle-add">
        <input
          type="text"
          placeholder="New bundle name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') createAndAdd()
          }}
        />
        <button
          type="button"
          className="primary"
          disabled={newName.trim().length === 0}
          onClick={createAndAdd}
        >
          Create &amp; add
        </button>
      </div>
    </Modal>
  )
}
