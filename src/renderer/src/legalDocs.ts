import policiesRaw from '@legal/policies.md?raw'
import { parseLegalDocuments, type LegalDocument } from '../../shared/legal'

// The legal text is baked into the renderer bundle at build time (same `?raw`
// source as the main process) and parsed once for display. The documents are
// shown verbatim — the modal renders these strings unaltered.
export const LEGAL_DOCS: LegalDocument[] = parseLegalDocuments(policiesRaw)
