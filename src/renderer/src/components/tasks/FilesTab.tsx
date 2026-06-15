import type { FileRecord } from '../../../../shared/types'
import { useOrb } from '../../orbState'
import { Note, Plus, X } from '../../icons'
import { fileUrl } from '../viewer/viewerUtils'

// The Files tab (Part 8): a grid of attachments. Images show a thumbnail;
// clicking a tile opens it in the document viewer. Attach pulls files in through
// a native dialog (the Orb works while they're ingested); the × detaches.
export default function FilesTab({
  taskId,
  files,
  reload,
  onOpenFile
}: {
  taskId: number
  files: FileRecord[]
  reload: () => void
  onOpenFile?: (fileId: number) => void
}): React.JSX.Element {
  const { rest } = useOrb()

  async function attach(): Promise<void> {
    rest('working')
    try {
      await window.kaseki.tasks.attachFiles(taskId)
      reload()
    } finally {
      rest('idle')
    }
  }

  return (
    <div className="files-tab">
      <div className="files-grid">
        {files.map((f) => (
          <div
            key={f.id}
            className="file-tile"
            role="button"
            tabIndex={0}
            onClick={() => onOpenFile?.(f.id)}
          >
            <div className="file-tile-preview">
              {f.kind === 'image' ? (
                <img src={fileUrl(f.id)} alt="" />
              ) : (
                <span className="file-tile-kind">
                  <Note size={20} />
                  {f.kind}
                </span>
              )}
            </div>
            <span className="file-tile-name" title={f.name}>
              {f.name}
            </span>
            <button
              type="button"
              className="file-tile-remove"
              aria-label="Detach file"
              onClick={(e) => {
                e.stopPropagation()
                window.kaseki.tasks.detachFile(taskId, f.id).then(reload)
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {files.length === 0 && <p className="hint">No files attached.</p>}
      </div>
      <button type="button" className="row-add" onClick={attach}>
        <Plus size={16} />
        Attach files…
      </button>
    </div>
  )
}
