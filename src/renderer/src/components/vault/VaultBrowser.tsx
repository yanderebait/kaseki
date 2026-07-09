import { useCallback, useEffect, useState } from 'react'
import { useEscapeLayer } from '../../hooks/useEscapeLayer'
import type { VaultFile } from '../../../../shared/types'
import { Pencil, Plus, Trash } from '../../icons'
import { formatSize } from '../viewer/viewerUtils'
import ContextMenu, { type ContextItem } from '../viewer/ContextMenu'
import Modal from '../Modal'

// The unlocked file browser (Part 11): a flat list of encrypted files with
// add, rename, delete, and (when wired) view. Deliberately plain — a file
// manager, not a smart workspace.
export default function VaultBrowser({
  onView
}: {
  onView?: (file: VaultFile) => void
}): React.JSX.Element {
  const [files, setFiles] = useState<VaultFile[]>([])
  const [renaming, setRenaming] = useState<number | null>(null)
  // While renaming, the input is the top escape layer: Escape cancels the
  // rename only (the stack listener runs in the capture phase, so the input's
  // own handler alone would lose the race with outer layers).
  useEscapeLayer(renaming != null, () => setRenaming(null))
  const [renameValue, setRenameValue] = useState('')
  const [pendingDelete, setPendingDelete] = useState<VaultFile | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number; file: VaultFile } | null>(null)

  const refresh = useCallback(() => {
    window.kaseki.vault.list().then(setFiles)
  }, [])
  useEffect(refresh, [refresh])

  async function add(): Promise<void> {
    await window.kaseki.vault.addFiles()
    refresh()
  }

  function startRename(f: VaultFile): void {
    setRenaming(f.id)
    setRenameValue(f.name)
  }

  function commitRename(): void {
    const v = renameValue.trim()
    if (renaming != null && v) window.kaseki.vault.rename(renaming, v).then(refresh)
    setRenaming(null)
  }

  function confirmDelete(): void {
    if (pendingDelete) window.kaseki.vault.delete(pendingDelete.id).then(refresh)
    setPendingDelete(null)
  }

  function contextItems(file: VaultFile): ContextItem[] {
    return [
      { label: 'View', disabled: !onView, onClick: () => onView?.(file) },
      { label: 'Rename', onClick: () => startRename(file) },
      { label: 'Delete', onClick: () => setPendingDelete(file) }
    ]
  }

  return (
    <div className="vault-browser">
      <div className="vault-browser-head">
        <span className="vault-browser-count">
          {files.length} {files.length === 1 ? 'file' : 'files'}
        </span>
        <button type="button" className="row-add" onClick={add}>
          <Plus size={16} />
          Add files
        </button>
      </div>

      {files.length === 0 ? (
        <p className="hint vault-empty">This folder is empty. Add files to keep them encrypted.</p>
      ) : (
        <ul className="vault-file-list">
          {files.map((f) => (
            <li
              key={f.id}
              className="vault-file-row"
              onContextMenu={(e) => {
                e.preventDefault()
                setCtx({ x: e.clientX, y: e.clientY, file: f })
              }}
            >
              {renaming === f.id ? (
                <input
                  className="vault-rename"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    // Escape is handled by the layer stack
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="vault-file-name"
                  disabled={!onView}
                  onClick={() => onView?.(f)}
                >
                  {f.name}
                </button>
              )}
              <span className="vault-file-size">{formatSize(f.size)}</span>
              <span className="vault-file-actions">
                <button type="button" aria-label="Rename" onClick={() => startRename(f)}>
                  <Pencil size={15} />
                </button>
                <button type="button" aria-label="Delete" onClick={() => setPendingDelete(f)}>
                  <Trash size={15} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <Modal title="Delete file" onClose={() => setPendingDelete(null)}>
          <p className="kn-modal-text">
            Permanently delete “{pendingDelete.name}” from the sensitive folder? This can’t be
            undone.
          </p>
          <div className="kn-modal-actions">
            <button type="button" onClick={() => setPendingDelete(null)}>
              Cancel
            </button>
            <button type="button" className="kn-danger" onClick={confirmDelete}>
              Delete
            </button>
          </div>
        </Modal>
      )}

      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={contextItems(ctx.file)}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  )
}
