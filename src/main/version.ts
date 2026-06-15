import { app } from 'electron'

// In dev, app.getVersion() reports Electron's own version, not Kaseki's.
export const appVersion = app.isPackaged
  ? app.getVersion()
  : (process.env.npm_package_version ?? 'dev')
