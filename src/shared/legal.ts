// Pure parser for the authoritative legal text bundled at `legal/policies.md`.
// The file is one Markdown document containing a preamble followed by six
// top-level sections — three documents, each in a "Human Readable" and a
// "Legal Jargon" version:
//
//   # Terms of Use — Human Readable
//   # Terms of Use — Legal Jargon
//   # Privacy Policy — Human Readable
//   ...
//
// `parseLegalDocuments` splits on those `# Title — Version` headings and pairs
// the two versions per title, preserving first-seen order. The preamble
// (`# Kaseki Legal Documents`, which has no " — Version" suffix) is ignored.
// The body of each section is returned verbatim (including blank lines, marks,
// and links) so the renderer can display the source unaltered.

export type LegalVersionKind = 'human' | 'legal'

export interface LegalDocument {
  /** Canonical document title, e.g. "Terms of Use". */
  title: string
  /** Verbatim Markdown body of the Human Readable version. */
  human: string
  /** Verbatim Markdown body of the Legal Jargon version. */
  legal: string
}

export interface LegalStatus {
  /** Whether the currently bundled version has been accepted. */
  accepted: boolean
  /** Fingerprint of the bundled text the status refers to. */
  version: string
}

// The three documents Kaseki expects, in presentation order. Used to validate
// the parsed set and to order it deterministically regardless of source order.
export const LEGAL_TITLES = ['Terms of Use', 'Privacy Policy', 'Acceptable Use Policy'] as const

// Matches a section heading line. The title is lazy so it stops at the first
// separator; the separator tolerates em dash, en dash, or hyphen; the version
// label is fixed. Anything else at level 1 (the preamble) does not match.
const SECTION_RE = /^#\s+(.+?)\s+[—–-]\s+(Human Readable|Legal Jargon)\s*$/

interface Partial {
  title: string
  human?: string
  legal?: string
}

export function parseLegalDocuments(raw: string): LegalDocument[] {
  const lines = raw.split(/\r?\n/)
  const order: string[] = []
  const byTitle = new Map<string, Partial>()

  let current: { title: string; kind: LegalVersionKind } | null = null
  let buffer: string[] = []

  const flush = (): void => {
    if (!current) return
    const entry = byTitle.get(current.title)
    if (entry) entry[current.kind] = buffer.join('\n').trim()
    current = null
    buffer = []
  }

  for (const line of lines) {
    const m = SECTION_RE.exec(line)
    if (m) {
      flush()
      const title = m[1].trim()
      const kind: LegalVersionKind = m[2] === 'Human Readable' ? 'human' : 'legal'
      if (!byTitle.has(title)) {
        byTitle.set(title, { title })
        order.push(title)
      }
      current = { title, kind }
      continue
    }
    if (current) buffer.push(line)
  }
  flush()

  return order.map((title) => {
    const entry = byTitle.get(title)!
    return { title, human: entry.human ?? '', legal: entry.legal ?? '' }
  })
}
