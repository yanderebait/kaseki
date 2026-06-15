import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useFileText } from './viewerUtils'

// Read-only markdown via marked. The output is sanitised with DOMPurify
// before insertion — a document could be a third party's, and the renderer
// holds the IPC bridge, so untrusted HTML must never run. Tiptap unifies
// the rich-text story in Phase 6.
export default function MarkdownRenderer({
  id,
  vault = false
}: {
  id: number
  vault?: boolean
}): React.JSX.Element {
  const text = useFileText(id, vault)
  const html = useMemo(() => {
    if (text === null) return null
    const raw = marked.parse(text, { async: false })
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
  }, [text])

  if (html === null) return <div className="viewer-loading">Loading…</div>
  return <div className="viewer-markdown" dangerouslySetInnerHTML={{ __html: html }} />
}
