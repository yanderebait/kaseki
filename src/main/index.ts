import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { closeDatabase, createDatabase, getAuthStatus, getDb, unlockDatabase } from './db/connection'
import { setPreferences } from './db/prefs'
import { addDependency, addSubtask, createTask, linkFile, updateSubtask, updateTask } from './db/tasks'
import { listFiles } from './db/files'
import { recordLegalAcceptance } from './legal'
import { createSpace, listSpaces } from './db/spaces'
import { ingestFile } from './db/files'
import { createAnnotation } from './db/annotations'
import { addFileToBundle, createBundle } from './db/bundles'
import { createEvent } from './db/events'
import { getPreset, presetToSpace } from '../shared/presets'
import { writeFileSync } from 'node:fs'
import { ensureDataDirectories, paths } from './paths'
import { registerFileProtocol, registerFileScheme } from './fileProtocol'
import { log, pruneOldLogs } from './logger'
import { appVersion } from './version'
import { installCrashHandlers } from './crashReport'
import { startBackgroundTasks, stopBackgroundTasks } from './background'
import { runLaunchUpdateCheck } from './updates'

// Must run before app ready.
registerFileScheme()

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0d0d0e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload only uses contextBridge + ipcRenderer, both fully
      // sandbox-compatible, so the renderer runs in the Chromium sandbox.
      sandbox: true
    }
  })

  window.on('ready-to-show', () => window.show())

  // The renderer never legitimately navigates away from the app bundle —
  // block anything else (defence in depth; nothing in the app links out via
  // navigation, but a crafted document shouldn't get to try).
  window.webContents.on('will-navigate', (event, url) => {
    const dev = process.env.ELECTRON_RENDERER_URL
    if (dev && url.startsWith(dev)) return
    if (url.startsWith('file://')) return
    event.preventDefault()
    log.warn('Blocked navigation', { url })
  })

  // Any window.open / target=_blank goes to the OS browser, never a new
  // Electron window — the renderer must stay confined to Kaseki's own UI.
  window.webContents.setWindowOpenHandler(({ url }) => {
    // Only web links reach the OS; file://, smb:// and friends are dropped.
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    else log.warn('Blocked openExternal', { url })
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  devCaptureScreenshot(window)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })

  app.whenReady().then(async () => {
    ensureDataDirectories()
    registerFileProtocol()
    log.info('Kaseki starting', { version: appVersion, dataRoot: paths.root })

    if (process.env.KASEKI_SELFTEST === '1') {
      const { runSelfTest } = await import('./selftest')
      app.exit(await runSelfTest())
      return
    }

    registerIpcHandlers()
    installCrashHandlers()
    pruneOldLogs()
    devBootstrap()
    createWindow()
    startBackgroundTasks()
    // Only does anything if the dev bootstrap already unlocked the database;
    // otherwise the check runs from the auth:unlock handler.
    runLaunchUpdateCheck()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    stopBackgroundTasks()
    closeDatabase()
  })
}

// Development-only convenience: with KASEKI_DEV_PASSWORD set, create or
// unlock the database at startup so UI work past the auth gate can be
// launched and screenshotted without typing. KASEKI_DEV_SEED=<n> seeds n
// sample spaces on a freshly created database. Hard-gated on !isPackaged,
// so these env vars are completely inert in a shipped build.
function devBootstrap(): void {
  if (app.isPackaged) return
  const password = process.env.KASEKI_DEV_PASSWORD
  if (!password) return
  const status = getAuthStatus()
  if (status === 'setup') {
    createDatabase(password, process.env.KASEKI_DEV_NAME ?? 'Dev')
    devSeedSpaces()
    devSeedFiles()
    devSeedEvents()
    devSeedTasks()
    // A freshly created dev database would otherwise be flagged for onboarding
    // (migration 005 only backfills pre-existing rows); stamp it so dev launches
    // land straight on the seeded home screen. KASEKI_DEV_ONBOARD=1 leaves it
    // unmarked instead, so the first-run flow can be exercised against a seeded
    // database. Both are inert in a packaged build.
    if (process.env.KASEKI_DEV_ONBOARD !== '1') {
      setPreferences({ onboardedAt: new Date().toISOString() })
      recordLegalAcceptance()
    }
  } else if (status === 'locked') {
    unlockDatabase(password)
  }
  log.info('Dev bootstrap applied')
}

// Development-only headless screenshot: with KASEKI_DEV_SHOT=<path> set, wait
// for the renderer to finish loading (plus KASEKI_DEV_SHOT_DELAY ms — default
// 1500 — for async IPC to settle), capture the window through webContents, and
// quit. Because the capture reads the renderer's own surface rather than the
// screen, it works even when another window occludes ours — the usual case
// under Wayland, where the compositor won't stack our window above a fullscreen
// app. Pair it with a forced view (e.g. AppShell's initial state) to shoot a
// specific surface. Hard-gated on !isPackaged, so it's inert in a shipped build.
function devCaptureScreenshot(window: BrowserWindow): void {
  if (app.isPackaged) return
  const target = process.env.KASEKI_DEV_SHOT
  if (!target) return
  const delay = Number(process.env.KASEKI_DEV_SHOT_DELAY) || 1500
  window.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      window.webContents
        .capturePage()
        .then((image) => {
          writeFileSync(target, image.toPNG())
          log.info('Dev screenshot written', { target })
          app.quit()
        })
        .catch((error) => {
          log.error('Dev screenshot failed', { error: String(error) })
          app.quit()
        })
    }, delay)
  })
}

function devSeedSpaces(): void {
  const n = Number(process.env.KASEKI_DEV_SEED)
  if (!Number.isInteger(n) || n <= 0) return
  // Seed realistic preset-based spaces (with custom fields, statuses, and
  // cheatsheets) so dev data exercises the full configuration.
  const seed: Array<[presetId: string, name?: string]> = [
    ['legal', "Sample Legal"],
    ['personal', 'Home'],
    ['software'],
    ['photographer'],
    ['gp'],
    ['writer'],
    ['accountant']
  ]
  for (let i = 0; i < Math.min(n, seed.length); i++) {
    const preset = getPreset(seed[i][0])
    if (preset) createSpace(presetToSpace(preset, seed[i][1]))
  }
}

// Dev-only: ingest a few sample documents (KASEKI_DEV_FILES=1) so the
// document viewer has content to render.
// Dev-only: seed calendar events across the current week so the strip and
// dashboard calendar have content. Only when spaces were seeded.
function devSeedEvents(): void {
  const n = Number(process.env.KASEKI_DEV_SEED)
  if (!Number.isInteger(n) || n <= 0) return
  // Bind to whatever spaces were actually seeded — KASEKI_DEV_SEED=1 makes
  // just one, so the second event falls back to the same space rather than a
  // non-existent space_id (which would trip the foreign key).
  const spaces = listSpaces()
  if (spaces.length === 0) return
  const primary = spaces[0].id
  const secondary = (spaces[1] ?? spaces[0]).id
  const at = (daysAhead: number, hour: number, minute = 0): string => {
    const d = new Date()
    d.setDate(d.getDate() + daysAhead)
    d.setHours(hour, minute, 0, 0)
    return d.toISOString()
  }
  createEvent({ spaceId: primary, title: 'WAIRB hearing — Mahsa', start: at(0, 14, 0), end: at(0, 16, 0), location: 'Upper Tribunal' })
  createEvent({ spaceId: primary, title: 'Client call — Priya', start: at(1, 11, 0), end: at(1, 11, 30) })
  createEvent({ spaceId: secondary, title: 'Feed tarantulas', start: at(0, 8, 0), recurrenceRule: 'FREQ=HOURLY;INTERVAL=12' })
  createEvent({ spaceId: null, title: 'Bank holiday', start: at(3, 0, 0), allDay: true })
  createEvent({ spaceId: primary, title: 'File the bundle', start: at(4, 9, 0), end: at(4, 9, 30) })
}

// Dev-only: seed a varied task list in the first space so the dashboard list
// shows pinned, blocked, awaiting, stale, and done states. Gated on
// KASEKI_DEV_SEED like the other seeds.
function devSeedTasks(): void {
  const n = Number(process.env.KASEKI_DEV_SEED)
  if (!Number.isInteger(n) || n <= 0) return
  const spaces = listSpaces()
  if (spaces.length === 0) return
  const sid = spaces[0].id
  const soon = (days: number): string => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d.toISOString()
  }
  const t1 = createTask({
    spaceId: sid,
    title: 'File the hearing bundle',
    status: 'In progress',
    priority: 'High',
    dueDate: soon(2)
  })
  updateTask(t1.id, { pinned: true })
  addSubtask(t1.id, 'Paginate the bundle')
  updateSubtask(addSubtask(t1.id, 'Confirm exhibit order').id, { completed: true })
  const seededFiles = listFiles()
  if (seededFiles.length > 0) linkFile(t1.id, seededFiles[0].id)
  const t2 = createTask({ spaceId: sid, title: 'Draft skeleton argument', status: 'To start', priority: 'Medium' })
  const t3 = createTask({ spaceId: sid, title: 'Serve the respondent', status: 'To start' })
  addDependency(t2.id, t3.id)
  createTask({ spaceId: sid, title: 'Awaiting counsel’s reply', status: 'Awaiting response', dueDate: soon(5) })
  const t5 = createTask({ spaceId: sid, title: 'Review old correspondence', status: 'To start' })
  getDb().prepare("UPDATE tasks SET updated_at = datetime('now', '-30 days') WHERE id = ?").run(t5.id)
  createTask({ spaceId: sid, title: 'Confirm the court date', status: 'Done' })
}

function devSeedFiles(): void {
  if (process.env.KASEKI_DEV_FILES !== '1') return
  const write = (name: string, content: string, display: string): ReturnType<typeof ingestFile> => {
    const tmp = join(paths.root, `seed-${name}`)
    writeFileSync(tmp, content)
    return ingestFile(tmp, display)
  }
  const svgFile = write(
    'diagram.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="240"><rect width="420" height="240" fill="#1a1a1c"/><rect x="30" y="50" width="150" height="70" rx="12" fill="#BA7517"/><text x="105" y="92" fill="#fff" font-family="sans-serif" font-size="18" text-anchor="middle">Matter</text><rect x="240" y="50" width="150" height="70" rx="12" fill="#534AB7"/><text x="315" y="92" fill="#fff" font-family="sans-serif" font-size="18" text-anchor="middle">Hearing</text><line x1="180" y1="85" x2="240" y2="85" stroke="#9ca3af" stroke-width="2"/><text x="210" y="200" fill="#9ca3af" font-family="sans-serif" font-size="14" text-anchor="middle">diagram.svg</text></svg>`,
    'matter-diagram.svg'
  )
  write(
    'caseload.csv',
    'Client,Matter reference,Hearing date,Status\nAlex,WAIRB-XQG-DXMJ-2223,2026-07-14,Court/Hearing\nJordan,REF-2025-0182,2026-08-02,Awaiting response\nSam,REF-2026-0014,,To start\n',
    'caseload.csv'
  )
  write(
    'notes.txt',
    'Hearing prep notes\n==================\n- Confirm bundle pagination before Friday.\n- Section 3C leave: 2 months from expiry.\n- Chase counsel for skeleton argument.\n',
    'hearing-notes.txt'
  )
  write(
    'readme.md',
    '# Matter readme\n\nKey facts for **WAIRB-XQG-DXMJ-2223**.\n\n- Client: Mahsa\n- Type: Immigration appeal\n\n## Next steps\n\n1. File the bundle.\n2. Confirm the hearing date.\n',
    'matter-readme.md'
  )
  const pdfPath = join(paths.root, 'seed-bundle.pdf')
  writeFileSync(
    pdfPath,
    buildSamplePdf([
      'Hearing bundle - cover page',
      'Witness statement of Mahsa',
      'Schedule of evidence',
      'Skeleton argument'
    ])
  )
  const pdfFile = ingestFile(pdfPath, 'hearing-bundle.pdf')
  createAnnotation({ fileId: pdfFile.id, page: 2, type: 'bookmark', content: 'Witness statement' })
  createAnnotation({ fileId: pdfFile.id, page: 4, type: 'bookmark', content: 'Skeleton argument' })
  createAnnotation({
    fileId: pdfFile.id,
    page: 1,
    type: 'highlight',
    position: { x: 0.118, y: 0.158, w: 0.64, h: 0.05 },
    color: '#EF9F27'
  })
  createAnnotation({
    fileId: pdfFile.id,
    page: 1,
    type: 'note',
    position: { x: 0.8, y: 0.22 },
    content: 'Confirm bundle pagination before Friday.'
  })
  const bundle = createBundle('Mahsa hearing bundle')
  addFileToBundle(bundle.id, pdfFile.id)
  addFileToBundle(bundle.id, svgFile.id)
}

// Builds a minimal valid multi-page PDF (correct xref offsets) so the viewer
// has a real PDF to render in dev. No runtime dependency.
function buildSamplePdf(pageTexts: string[]): Buffer {
  const objs: string[] = []
  const fontNum = 1
  const catalogNum = 2
  const pagesNum = 3
  const pageNums: number[] = []
  const contentNums: number[] = []
  let next = 4
  for (let i = 0; i < pageTexts.length; i++) {
    pageNums.push(next++)
    contentNums.push(next++)
  }
  objs[fontNum] = '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'
  objs[catalogNum] = `<</Type/Catalog/Pages ${pagesNum} 0 R>>`
  objs[pagesNum] = `<</Type/Pages/Kids[${pageNums.map((n) => `${n} 0 R`).join(' ')}]/Count ${pageTexts.length}>>`
  pageTexts.forEach((text, i) => {
    objs[pageNums[i]] =
      `<</Type/Page/Parent ${pagesNum} 0 R/MediaBox[0 0 612 792]` +
      `/Resources<</Font<</F1 ${fontNum} 0 R>>>>/Contents ${contentNums[i]} 0 R>>`
    const stream = `BT /F1 26 Tf 72 700 Td (${text}) Tj ET`
    objs[contentNums[i]] = `<</Length ${Buffer.byteLength(stream, 'latin1')}>>\nstream\n${stream}\nendstream`
  })

  const total = next - 1
  const offsets: number[] = []
  let body = '%PDF-1.4\n'
  for (let n = 1; n <= total; n++) {
    offsets[n] = Buffer.byteLength(body, 'latin1')
    body += `${n} 0 obj\n${objs[n]}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(body, 'latin1')
  body += `xref\n0 ${total + 1}\n0000000000 65535 f \n`
  for (let n = 1; n <= total; n++) body += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<</Size ${total + 1}/Root ${catalogNum} 0 R>>\nstartxref\n${xrefOffset}\n%%EOF`
  return Buffer.from(body, 'latin1')
}
