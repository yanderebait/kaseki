import { useMemo, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { LEGAL_DOCS } from '../../legalDocs'
import { useFocusTrap } from '../../hooks/useFocusTrap'

// Renders a verbatim Markdown string. The text is the bundled legal source, so
// it is trusted, but it is sanitised anyway (defence in depth in the renderer,
// which holds the IPC bridge). marked runs with its defaults (GFM), preserving
// paragraphs, emphasis, lists, and links so nothing is dropped from the source.
function LegalMarkdown({ text }: { text: string }): React.JSX.Element {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(text, { async: false }), { USE_PROFILES: { html: true } }),
    [text]
  )
  return <div className="legal-md" dangerouslySetInnerHTML={{ __html: html }} />
}

// The dual-pane legal documents view (Part 13 / Part 14). The three documents
// are selectable across the top; each shows the friendly "Human Readable"
// version on the left and the binding "Legal Jargon" version on the right.
// In 'accept' mode (onboarding gate) it cannot be dismissed except by
// accepting, which records acceptance of all three documents with a timestamp.
// In 'view' mode (Settings → About) it is a dismissible reader.
export default function LegalModal({
  mode,
  onAccept,
  onClose
}: {
  mode: 'accept' | 'view'
  onAccept?: () => void
  onClose?: () => void
}): React.JSX.Element {
  const [active, setActive] = useState(0)
  const doc = LEGAL_DOCS[active]
  const trapRef = useFocusTrap<HTMLDivElement>()

  return (
    <div className="legal-backdrop" role="dialog" aria-modal="true" aria-label="Legal documents">
      <div ref={trapRef} className="legal-modal">
        <header className="legal-head">
          <div className="legal-tabs" role="tablist">
            {LEGAL_DOCS.map((d, i) => (
              <button
                key={d.title}
                type="button"
                role="tab"
                aria-selected={i === active}
                className={i === active ? 'active' : ''}
                onClick={() => setActive(i)}
              >
                {d.title}
              </button>
            ))}
          </div>
          {mode === 'view' && (
            <button type="button" className="legal-close" aria-label="Close" onClick={onClose}>
              ×
            </button>
          )}
        </header>

        <div className="legal-panes">
          <section className="legal-pane">
            <h3 className="legal-pane-label">Human Readable</h3>
            <LegalMarkdown text={doc.human} />
          </section>
          <section className="legal-pane legal-pane-jargon">
            <h3 className="legal-pane-label">Legal Jargon</h3>
            <LegalMarkdown text={doc.legal} />
          </section>
        </div>

        <footer className="legal-foot">
          {mode === 'accept' ? (
            <>
              <p className="hint">
                Accepting covers all three documents — both the plain-English and the formal
                versions.
              </p>
              <button type="button" className="primary" onClick={onAccept}>
                I understand and accept
              </button>
            </>
          ) : (
            <button type="button" className="primary" onClick={onClose}>
              Done
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
