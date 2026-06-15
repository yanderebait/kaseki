import { useEffect, useState } from 'react'
import type { VaultFile } from '../../../../shared/types'
import { X } from '../../icons'
import ImageRenderer from '../viewer/ImageRenderer'
import TextRenderer from '../viewer/TextRenderer'
import CsvRenderer from '../viewer/CsvRenderer'
import MarkdownRenderer from '../viewer/MarkdownRenderer'
import VaultPdfRenderer from './VaultPdfRenderer'

// A deliberately minimal viewer for a sensitive file: it displays decrypted
// bytes streamed in memory over the vault protocol, with no print, save, or
// export — those would write plaintext to disk, which the sensitive folder
// must never do. PDFs render read-only (no annotations).
export default function VaultViewer({
  file,
  onClose
}: {
  file: VaultFile
  onClose: () => void
}): React.JSX.Element {
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Copying sensitive content arms a 30-second clipboard auto-clear in main;
  // confirm it with a toast when it's enabled.
  function onCopy(): void {
    window.kaseki.vault.scheduleClipboardClear().then((scheduled) => {
      if (!scheduled) return
      setToast('Copied — clipboard will clear in 30 seconds.')
      setTimeout(() => setToast(null), 4000)
    })
  }

  function body(): React.JSX.Element {
    switch (file.kind) {
      case 'image':
        return <ImageRenderer id={file.id} zoom={1} vault />
      case 'pdf':
        return <VaultPdfRenderer id={file.id} />
      case 'text':
        return <TextRenderer id={file.id} vault />
      case 'csv':
        return <CsvRenderer id={file.id} vault />
      case 'markdown':
        return <MarkdownRenderer id={file.id} vault />
      default:
        return (
          <div className="viewer-placeholder">
            No preview for this file type. It’s safely stored in the folder.
          </div>
        )
    }
  }

  return (
    <div className="vault-viewer">
      <div className="vault-viewer-bar">
        <span className="vault-viewer-name">{file.name}</span>
        <span className="vault-spacer" />
        <button type="button" className="icon-button" aria-label="Close file" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="vault-viewer-body" onCopy={onCopy}>
        {body()}
      </div>
      {toast && <div className="vault-toast">{toast}</div>}
    </div>
  )
}
