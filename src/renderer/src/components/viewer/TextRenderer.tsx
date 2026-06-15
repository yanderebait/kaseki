import { useFileText } from './viewerUtils'

// Plain text and code in a monospace block. Syntax highlighting is a later
// nicety; the goal here is faithful, readable display.
export default function TextRenderer({
  id,
  vault = false
}: {
  id: number
  vault?: boolean
}): React.JSX.Element {
  const text = useFileText(id, vault)
  if (text === null) return <div className="viewer-loading">Loading…</div>
  return <pre className="viewer-text">{text}</pre>
}
