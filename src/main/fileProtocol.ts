import { protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { getFilePath } from './db/files'
import { readVaultFile } from './vault/store'
import { log } from './logger'

export const FILE_SCHEME = 'kaseki-file'

// Registered before app ready: a standard, secure scheme so the renderer can
// fetch file bytes (and PDF.js / <img> can load them) without filesystem
// access, while staying entirely local. Must be called at module load,
// before app.whenReady().
export function registerFileScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: FILE_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

// kaseki-file://doc/<id>   -> the blob in uploads/, with its content-type.
// kaseki-file://vault/<id> -> a sensitive file, decrypted in memory (only
// when the vault is unlocked; the plaintext is in the Response, never on
// disk). The renderer only ever knows ids; paths and keys never leave main.
export function registerFileProtocol(): void {
  protocol.handle(FILE_SCHEME, async (request) => {
    const url = new URL(request.url)
    const id = Number(url.pathname.replace(/^\//, ''))
    if (!Number.isInteger(id)) {
      log.warn('File protocol: unresolved request', { url: request.url })
      return new Response('Not found', { status: 404 })
    }
    // ACAO lets the renderer's fetch() read the body (text/CSV/PDF.js); <img>
    // works without it. The scheme only ever serves the user's own local
    // files, so * is safe here.
    const cors = { 'access-control-allow-origin': '*' }
    try {
      if (url.host === 'vault') {
        // Throws if the vault is locked — treated as not-found, not an error.
        const decrypted = readVaultFile(id)
        if (!decrypted) return new Response('Not found', { status: 404 })
        return new Response(decrypted.bytes, {
          headers: { 'content-type': decrypted.mime, ...cors }
        })
      }
      const target = getFilePath(id)
      if (!target) return new Response('Not found', { status: 404 })
      return new Response(await readFile(target.path), {
        headers: { 'content-type': target.mime, ...cors }
      })
    } catch (error) {
      // A locked vault reaches here via readVaultFile's guard.
      if (error instanceof Error && /locked/.test(error.message)) {
        return new Response('Locked', { status: 404 })
      }
      log.error('File protocol read failed', error)
      return new Response('Error', { status: 500 })
    }
  })
}
