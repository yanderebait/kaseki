import type { FileRecord } from '../../../../shared/types'
import { formatDbDate, formatSize } from './viewerUtils'

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }): React.JSX.Element {
  return (
    <div className="viewer-meta-row">
      <span className="viewer-meta-label">{label}</span>
      <span className={mono ? 'viewer-meta-value mono' : 'viewer-meta-value'}>{value}</span>
    </div>
  )
}

// The document metadata pane (Part 9). Task/bundle/annotation references
// arrive with those systems.
export default function MetadataPane({ file }: { file: FileRecord }): React.JSX.Element {
  return (
    <aside className="viewer-meta">
      <span className="region-title">Details</span>
      <Row label="Name" value={file.name} />
      <Row label="Kind" value={file.kind} />
      <Row label="Type" value={file.mime ?? '—'} />
      <Row label="Size" value={formatSize(file.size)} />
      <Row label="SHA-256" value={`${file.hash.slice(0, 16)}…`} mono />
      <Row label="Uploaded" value={formatDbDate(file.uploadedAt)} />
      <p className="hint">Linked tasks, bundles, and annotations will appear here in later phases.</p>
    </aside>
  )
}
