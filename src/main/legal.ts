import { createHash } from 'node:crypto'
import policiesRaw from '@legal/policies.md?raw'
import { parseLegalDocuments, type LegalDocument, type LegalStatus } from '../shared/legal'
import { getDb } from './db/connection'

// The authoritative legal text, baked in at build time and parsed once. The
// renderer imports and parses the same source for display; the main process
// parses it here only to own the version identity and the acceptance record.
export const LEGAL_DOCUMENTS: LegalDocument[] = parseLegalDocuments(policiesRaw)

// A short content fingerprint of the exact bytes the user is shown. Acceptance
// is keyed on this, so revising the source produces a new version that the
// user is asked to accept again — the old acceptance row stays as history.
export const LEGAL_VERSION = createHash('sha256').update(policiesRaw, 'utf8').digest('hex').slice(0, 16)

export function getLegalDocuments(): LegalDocument[] {
  return LEGAL_DOCUMENTS
}

// Whether the user has accepted the version of the documents currently bundled.
export function legalAcceptanceStatus(): LegalStatus {
  const row = getDb()
    .prepare('SELECT 1 FROM legal_acceptance WHERE doc_version = ? LIMIT 1')
    .get(LEGAL_VERSION)
  return { accepted: row !== undefined, version: LEGAL_VERSION }
}

// Records acceptance of the current version with a server-side timestamp. The
// spec accepts both versions of all three documents in a single action, so one
// row per acceptance event captures the whole set.
export function recordLegalAcceptance(): LegalStatus {
  getDb().prepare('INSERT INTO legal_acceptance (doc_version) VALUES (?)').run(LEGAL_VERSION)
  return { accepted: true, version: LEGAL_VERSION }
}
