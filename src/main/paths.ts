import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// The spec (Part 2) fixes the data directory per platform. Note this is NOT
// Electron's userData default — on Linux that would be ~/.config/Kaseki,
// but the spec mandates the XDG data directory instead.
function resolveDataRoot(): string {
  // Escape hatch for tests and portable installs.
  if (process.env.KASEKI_DATA_DIR) return process.env.KASEKI_DATA_DIR
  switch (process.platform) {
    case 'win32':
      return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Kaseki')
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', 'Kaseki')
    default:
      return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'Kaseki')
  }
}

export const dataRoot = resolveDataRoot()

export const paths = {
  root: dataRoot,
  database: join(dataRoot, 'kaseki.db'),
  uploads: join(dataRoot, 'uploads'),
  sensitive: join(dataRoot, 'sensitive'),
  backgrounds: join(dataRoot, 'backgrounds'),
  icons: join(dataRoot, 'icons'),
  logs: join(dataRoot, 'logs')
} as const

export function ensureDataDirectories(): void {
  for (const dir of [
    paths.root,
    paths.uploads,
    paths.sensitive,
    paths.backgrounds,
    paths.icons,
    paths.logs
  ]) {
    mkdirSync(dir, { recursive: true })
  }
}
