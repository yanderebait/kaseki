import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from './paths'
import {
  closeDatabase,
  createDatabase,
  getAuthStatus,
  getDb,
  getUser,
  rekeyDatabase,
  unlockDatabase
} from './db/connection'
import { getPreferences, setPreferences } from './db/prefs'
import {
  archiveSpace,
  createSpace,
  deleteSpace,
  getSpaceDetail,
  listArchivedSpaces,
  listSpaces,
  setSpaceBilling,
  updateSpace
} from './db/spaces'
import { listActivity } from './db/activity'
import {
  createUrlItem,
  listLauncherItems,
  moveItem,
  normalizeUrl,
  removeItem
} from './db/launcher'
import { deleteFile, deriveKind, getFile, ingestFile, listFiles, renameFile } from './db/files'
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotations,
  updateAnnotation
} from './db/annotations'
import { buildAnnotatedPdf, buildCombinedPdf } from './exportActions'
import {
  addFileToBundle,
  createBundle,
  getBundle,
  listBundles,
  moveBundleFile,
  removeFileFromBundle
} from './db/bundles'
import {
  cancelOccurrence,
  createEvent,
  deleteEvent,
  expandEvents,
  getEvent,
  setOccurrenceCompleted,
  setOverride,
  splitSeries,
  truncateSeries,
  updateEvent
} from './db/events'
import { buildIcs, exportIcs } from './ics'
import {
  createPage,
  deletePage,
  getPage,
  listTree,
  movePage,
  reorderPage,
  searchPages,
  updatePage
} from './db/knowledge'
import { createLink, deleteLink, linkCandidates, listBacklinks, listOutgoing } from './db/links'
import { globalSearch } from './db/search'
import { parseCsv, toCsv } from '../shared/csv'
import {
  WIDGET_TYPES,
  DEFAULT_WIDGETS,
  addWidget,
  availableWidgets,
  moveWidget,
  normalizeBookmarkUrl,
  normalizeBookmarks,
  normalizeClocks,
  normalizeLayout,
  normalizeWeatherConfig,
  removeWidget,
  weatherLabel,
  weatherReady,
  zoneLabel,
  zoneOffsetLabel,
  DEFAULT_CLOCKS,
  CLOCKS_MAX
} from '../shared/widgets'
import {
  UPDATE_RELEASES_URL,
  isNewerVersion,
  parseVersion,
  updateCheckEnabled,
  launchCheckDue
} from '../shared/updates'
import { checkForUpdate, parseLatestRelease, runLaunchUpdateCheck, setUpdateCheckEnabled, updateStatus } from './updates'
import {
  DEFAULT_NOTIFICATIONS,
  digestBody,
  digestDue,
  dueReminders,
  localDateKey,
  reminderKey,
  type ReminderCandidate
} from '../shared/notifications'
import {
  DEFAULT_BACKUP,
  backupFolderName,
  backupsToPrune,
  isBackupFolderName,
  scheduledBackupDue
} from '../shared/backup'
import { createBackup, isInside, isRestorable, pruneBackups, readManifest, restoreInto } from './backup'
import { defaultSearchOptions, normalizeSearchOptions, SEARCH_TYPES } from '../shared/searchOptions'
import { dueCounts, listUpcoming } from './db/upcoming'
import { TASK_EXPORT_HEADER, buildTasksCsv } from './dataExport'
import { forecastUrl, getWeather, parseForecast, parsePlaces } from './weather'
import {
  capRuleBefore,
  floatingFromInstant,
  instantFromWall,
  isValidTz,
  occurrencesBetween,
  shiftInstantByWallDelta
} from './recur'
import { normalizeArchivedStatuses } from './db/migrations'
import { buildEvent, crashConfig, parseDsn, reportError } from './crashReport'
import { backgroundTick } from './background'
import { homedir } from 'node:os'
import { pmText, pmToMarkdown } from './prosemirror'
import { BIP39_WORDLIST } from './vault/wordlist'
import {
  KEY_BYTES,
  deriveKeyFromEntropy,
  deriveKeyFromPasscode,
  entropyToMnemonic,
  generateMnemonic,
  mnemonicToEntropy,
  open,
  randomKey,
  randomSalt,
  seal,
  tryOpen,
  validateMnemonic
} from './vault/crypto'
import {
  addFile,
  changePasscode,
  createVault,
  deleteVaultFile,
  listVaultFiles,
  lock as lockVault,
  readVaultFile,
  renameVaultFile,
  resetWithRecovery,
  unlock as unlockVault,
  vaultStatus
} from './vault/store'
import {
  addDependency,
  addSubtask,
  addTag,
  addTimeEntry,
  applyTemplate,
  createTag,
  createTask,
  createTemplate,
  deleteSubtask,
  deleteTask,
  deleteTemplate,
  deleteTimeEntry,
  getNote,
  getTask,
  getTaskDetail,
  incompleteBlockerCount,
  linkFile,
  listFieldValues,
  listSpaceTags,
  listSubtasks,
  listTaskActivity,
  listTaskFiles,
  listTaskTags,
  listArchivedTasks,
  listTasks,
  listTemplates,
  listTimeEntries,
  removeDependency,
  removeTag,
  reorderSubtask,
  saveNote,
  searchTasks,
  setFieldValue,
  timeReport,
  timeTrackedFor,
  unlinkFile,
  updateSubtask,
  updateTask,
  updateTimeEntry
} from './db/tasks'
import { computeAmount, computeWindowAmount, resolveBilling } from '../shared/billing'
import { PRESETS, UNIVERSAL_STATUSES, getPreset, presetToSpace, searchPresets } from '../shared/presets'
import { LEGAL_DOCUMENTS, LEGAL_VERSION, legalAcceptanceStatus, recordLegalAcceptance } from './legal'
import { LEGAL_TITLES } from '../shared/legal'
import { firstRunOverlays, legalGate, tourVisible, updatePromptVisible } from '../shared/firstRun'

function readFileExists(path: string): boolean {
  try {
    readFileSync(path)
    return true
  } catch {
    return false
  }
}

// A small Tiptap/ProseMirror document for exercising page content.
function pmDoc(...paragraphs: string[]): Record<string, unknown> {
  return {
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }]
    }))
  }
}

// Minimal single-page PDF (correct xref) so the annotated-export path has a
// real PDF to operate on.
function minimalPdf(): Buffer {
  const objs: string[] = []
  objs[1] = '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'
  objs[2] = '<</Type/Catalog/Pages 3 0 R>>'
  objs[3] = '<</Type/Pages/Kids[4 0 R]/Count 1>>'
  objs[4] =
    '<</Type/Page/Parent 3 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 1 0 R>>>>/Contents 5 0 R>>'
  const s = 'BT /F1 26 Tf 72 700 Td (Sample) Tj ET'
  objs[5] = `<</Length ${Buffer.byteLength(s, 'latin1')}>>\nstream\n${s}\nendstream`
  let body = '%PDF-1.4\n'
  const off: number[] = []
  for (let n = 1; n <= 5; n++) {
    off[n] = Buffer.byteLength(body, 'latin1')
    body += `${n} 0 obj\n${objs[n]}\nendobj\n`
  }
  const x = Buffer.byteLength(body, 'latin1')
  body += 'xref\n0 6\n0000000000 65535 f \n'
  for (let n = 1; n <= 5; n++) body += `${String(off[n]).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<</Size 6/Root 2 0 R>>\nstartxref\n${x}\n%%EOF`
  return Buffer.from(body, 'latin1')
}

// Runs when KASEKI_SELFTEST=1 (combine with KASEKI_DATA_DIR to avoid
// touching real data). Exercises the encrypted database lifecycle in the
// real Electron process and reports via exit code.
// v0.3.3: 0.3.2 never started, because the startup code read a preference
// from the still-locked database and the crash handler then did the same.
// Everything reachable at startup (or from the error handlers) before the
// password is entered must cope with the database not being open.
function lockedStartupChecks(when: string, check: (name: string, pass: boolean) => void): void {
  const noThrow = (fn: () => unknown): boolean => {
    try {
      fn()
      return true
    } catch {
      return false
    }
  }
  check(`locked startup (${when}): getDb() itself still refuses`, !noThrow(() => getDb()))
  check(`locked startup (${when}): the launch update check does not throw`, noThrow(() => runLaunchUpdateCheck()))
  check(`locked startup (${when}): crash reporting reads as off`, noThrow(() => crashConfig()) && crashConfig().enabled === false)
  check(`locked startup (${when}): reportError does not throw`, noThrow(() => reportError(new Error('locked test'), 'main')))
  check(`locked startup (${when}): the background tick does not throw`, noThrow(() => backgroundTick()))
}

export async function runSelfTest(): Promise<number> {
  const failures: string[] = []
  const check = (name: string, pass: boolean): void => {
    if (!pass) failures.push(name)
    process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}\n`)
  }

  try {
    check('starts in setup state', getAuthStatus() === 'setup')
    lockedStartupChecks('before the database exists', check)

    createDatabase('self-test-password', 'Tester')
    check('create unlocks', getAuthStatus() === 'unlocked')

    const tables = getDb()
      .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'")
      .get() as { n: number }
    check('migrations created schema', tables.n >= 20)

    check('user row created with name', getUser().name === 'Tester')

    check('prefs start empty', Object.keys(getPreferences()).length === 0)
    setPreferences({ theme: 'light' })
    check('prefs persist a value', getPreferences().theme === 'light')
    setPreferences({ widgetView: 'grid' })
    const merged = getPreferences()
    check('prefs merge without clobbering', merged.theme === 'light' && merged.widgetView === 'grid')

    check('spaces start empty', listSpaces().length === 0)
    const legal = createSpace({ name: 'Legal', accentColor: '#BA7517' })
    check(
      'space created at position 0 with zero active tasks',
      legal.name === 'Legal' && legal.position === 0 && legal.activeTaskCount === 0
    )
    createSpace({ name: 'Home', accentColor: '#639922' })
    const spaces = listSpaces()
    check(
      'spaces listed in position order',
      spaces.length === 2 && spaces[0].name === 'Legal' && spaces[1].position === 1
    )

    check('activity log starts empty', listActivity().length === 0)

    // Presets (pure data — no database needed)
    check('51 presets defined', PRESETS.length === 51)
    check(
      'every preset has name, aliases, accent, icon',
      PRESETS.every(
        (p) => p.name && p.aliases.length > 0 && /^#[0-9A-Fa-f]{6}$/.test(p.accent) && p.icon.length > 0
      )
    )
    check('preset ids are unique', new Set(PRESETS.map((p) => p.id)).size === PRESETS.length)
    check('search: lawyer -> Legal Practice', searchPresets('lawyer')[0]?.id === 'legal')
    check('search: vet -> Veterinarian', searchPresets('vet')[0]?.id === 'vet')
    check('search: coder -> Software Engineer', searchPresets('coder')[0]?.id === 'software')
    check('name match outranks alias match', searchPresets('photographer')[0]?.id === 'photographer')
    check('anchors carry researched fields', (getPreset('legal')?.fields.length ?? 0) >= 5)
    check(
      'billing presets carry their pattern',
      getPreset('legal')?.billing === 'time' &&
        getPreset('photographer')?.billing === 'job' &&
        getPreset('dentist')?.billing === 'unit'
    )
    check(
      'non-billing presets default to none',
      (getPreset('teacher')?.billing ?? 'none') === 'none' &&
        (getPreset('software')?.billing ?? 'none') === 'none'
    )

    // Applying a preset on creation
    const legalPreset = getPreset('legal')!
    const legalSpace = createSpace(presetToSpace(legalPreset, "Sample Legal"))
    const detail = getSpaceDetail(legalSpace.id)
    check('preset space records preset_id', detail.presetId === 'legal')
    check('preset space applies custom fields', detail.fields.length === legalPreset.fields.length)
    check(
      'preset field options round-trip',
      detail.fields.find((f) => f.name === 'Fee arrangement')?.options?.includes('Legal aid') === true
    )
    check('preset space stores its status set', detail.statusSet.includes('Court/Hearing'))
    check('preset space stores its cheatsheet', detail.cheatsheet.length > 0)
    check('custom name overrides preset name', detail.name === "Sample Legal")
    const bare = getSpaceDetail(createSpace({ name: 'Bare', accentColor: '#378ADD' }).id)
    check('bare space defaults to universal statuses', bare.statusSet.join('|') === UNIVERSAL_STATUSES.join('|') && bare.fields.length === 0)

    // Launcher
    check('url normalization adds scheme', normalizeUrl('example.com') === 'https://example.com')
    check('url normalization keeps scheme', normalizeUrl('http://x.test') === 'http://x.test')
    check(
      'preset space seeds suggested apps',
      listLauncherItems(legalSpace.id).length === legalPreset.suggestedApps.length
    )
    check('bare space seeds no apps', listLauncherItems(bare.id).length === 0)
    const item = createUrlItem(bare.id, 'Example', 'example.com')
    check('url item created and available', item.kind === 'url' && item.available)
    const second = createUrlItem(bare.id, 'Second', 'second.test')
    moveItem(second.id, -1)
    check('reorder swaps positions', listLauncherItems(bare.id)[0].name === 'Second')
    removeItem(item.id)
    check('remove drops the item', listLauncherItems(bare.id).length === 1)

    // Tasks (Part 7) — exercised against the field-rich legal space.
    const task1 = createTask({
      spaceId: legalSpace.id,
      title: 'File the bundle',
      description: 'Confirm pagination before the hearing',
      status: 'To start',
      priority: 'High'
    })
    check(
      'task created with fields',
      task1.title === 'File the bundle' &&
        task1.priority === 'High' &&
        task1.spaceId === legalSpace.id &&
        !task1.pinned &&
        !task1.archived
    )
    check('task fetched by id', getTask(task1.id)?.description === 'Confirm pagination before the hearing')
    const task2 = createTask({ spaceId: legalSpace.id, title: 'Call client', dueDate: '2026-07-01T09:00:00.000Z' })
    const task3 = createTask({ spaceId: legalSpace.id, title: 'Draft skeleton argument' })

    updateTask(task1.id, { pinned: true })
    check('list orders pinned first', listTasks(legalSpace.id)[0]?.id === task1.id)
    check('list is scoped to the space', listTasks(bare.id).length === 0)
    check('dated task sorts ahead of undated', (() => {
      const ids = listTasks(legalSpace.id).map((t) => t.id)
      return ids.indexOf(task2.id) < ids.indexOf(task3.id)
    })())

    updateTask(task3.id, { archived: true })
    check('archived task drops from the list', !listTasks(legalSpace.id).some((t) => t.id === task3.id))

    // Subtasks
    const sub1 = addSubtask(task1.id, 'Paginate the bundle')
    const sub2 = addSubtask(task1.id, 'Check exhibit order')
    check('subtasks added in order', listSubtasks(task1.id).map((s) => s.title).join('|') === 'Paginate the bundle|Check exhibit order')
    updateSubtask(sub1.id, { completed: true })
    check('subtask toggled complete', listSubtasks(task1.id).find((s) => s.id === sub1.id)?.completed === true)
    reorderSubtask(sub2.id, -1)
    check('subtask reordered up', listSubtasks(task1.id)[0]?.id === sub2.id)
    const sum1 = listTasks(legalSpace.id).find((t) => t.id === task1.id)
    check('summary carries subtask counts', sum1?.subtaskCount === 2 && sum1?.subtaskDone === 1)
    deleteSubtask(sub2.id)
    check('subtask deleted', listSubtasks(task1.id).length === 1)

    // Tags — find-or-create dedups case-insensitively
    const tagU = createTag(legalSpace.id, 'Urgent')
    check('tag created', tagU.name === 'Urgent')
    check('tag dedups by name', createTag(legalSpace.id, 'urgent').id === tagU.id)
    addTag(task1.id, tagU.id)
    check('tag attached to task', listTaskTags(task1.id).some((t) => t.id === tagU.id))
    check('space tag list includes it', listSpaceTags(legalSpace.id).some((t) => t.id === tagU.id))
    removeTag(task1.id, tagU.id)
    check('tag detached', listTaskTags(task1.id).length === 0)

    // Custom field values against the legal space's definitions
    const fields = listFieldValues(task1.id)
    check('field values list mirrors space definitions', fields.length === detail.fields.length && fields.every((f) => f.value === null))
    const fid = fields[0].fieldId
    setFieldValue(task1.id, fid, 'WAIRB-XQG-DXMJ-2223')
    check('field value set', listFieldValues(task1.id).find((f) => f.fieldId === fid)?.value === 'WAIRB-XQG-DXMJ-2223')
    setFieldValue(task1.id, fid, null)
    check('field value cleared', listFieldValues(task1.id).find((f) => f.fieldId === fid)?.value === null)

    // Search — title, description, and subtask titles, scoped to the space
    check('search matches title', searchTasks(legalSpace.id, 'bundle').some((t) => t.id === task1.id))
    check('search matches description', searchTasks(legalSpace.id, 'pagination').some((t) => t.id === task1.id))
    check('search matches subtask title', searchTasks(legalSpace.id, 'Paginate').some((t) => t.id === task1.id))
    check('search is scoped to the space', searchTasks(bare.id, 'bundle').length === 0)

    // Stale signal
    getDb().prepare("UPDATE tasks SET updated_at = '2020-01-01 00:00:00' WHERE id = ?").run(task2.id)
    check('untouched task reads as stale', listTasks(legalSpace.id).find((t) => t.id === task2.id)?.stale === true)
    check('recent task is not stale', listTasks(legalSpace.id).find((t) => t.id === task1.id)?.stale === false)

    // Detail + cascading delete
    const detail1 = getTaskDetail(task1.id)
    check('detail bundles subtasks, fields, and zero time', detail1 !== null && detail1.subtasks.length === 1 && detail1.fields.length === detail.fields.length && detail1.timeTracked === 0)
    addTag(task1.id, tagU.id)
    deleteTask(task1.id)
    check('delete cascades children', getTask(task1.id) === null && listSubtasks(task1.id).length === 0 && listTaskTags(task1.id).length === 0)

    // Task relationships (Part 7): dependencies, notes, files, time, activity, templates
    const depA = createTask({ spaceId: legalSpace.id, title: 'Gather evidence' })
    const depB = createTask({ spaceId: legalSpace.id, title: 'Draft submission' })
    const depC = createTask({ spaceId: legalSpace.id, title: 'File submission' })
    check('dependency added', addDependency(depA.id, depB.id).ok && addDependency(depB.id, depC.id).ok)
    check('self-dependency refused', addDependency(depA.id, depA.id).ok === false)
    const cycle = addDependency(depC.id, depA.id)
    check('circular dependency refused', cycle.ok === false && /circular/i.test(cycle.error ?? ''))
    check('downstream task reads as blocked', listTasks(legalSpace.id).find((t) => t.id === depB.id)?.blocked === true)
    check('incomplete blocker count', incompleteBlockerCount(depB.id) === 1)
    const detB = getTaskDetail(depB.id)
    check('detail lists blockers and blocking', detB?.blockers.some((t) => t.id === depA.id) === true && detB?.blocking.some((t) => t.id === depC.id) === true)
    updateTask(depA.id, { status: 'Done' })
    check('completing the blocker unblocks', listTasks(legalSpace.id).find((t) => t.id === depB.id)?.blocked === false && incompleteBlockerCount(depB.id) === 0)
    removeDependency(depA.id, depB.id)
    check('dependency removed', getTaskDetail(depB.id)?.blockers.length === 0)

    // Notes
    const noteDoc = pmDoc('Key facts for the submission.')
    saveNote(depA.id, noteDoc)
    check('note saved and read back', JSON.stringify(getNote(depA.id)) === JSON.stringify(noteDoc))
    saveNote(depA.id, null)
    check('note cleared', getNote(depA.id) === null)

    // File attachments (reuse the content-addressed store)
    const taskFileTmp = join(paths.root, 'selftest-task-attach.txt')
    writeFileSync(taskFileTmp, 'evidence bundle index')
    const attached = ingestFile(taskFileTmp, 'evidence.txt')
    linkFile(depA.id, attached.id)
    check('file attached and listed', listTaskFiles(depA.id).some((f) => f.id === attached.id))
    unlinkFile(depA.id, attached.id)
    check('file detached', listTaskFiles(depA.id).length === 0)

    // Time entries: aggregate, manual edit, delete
    const te1 = addTimeEntry({ taskId: depA.id, startAt: '2026-06-15T09:00:00.000Z', duration: 25, isPomodoro: true })
    const te2 = addTimeEntry({ taskId: depA.id, startAt: '2026-06-15T10:00:00.000Z', duration: 40 })
    check('time tracked aggregates entries', timeTrackedFor(depA.id) === 65 && listTimeEntries(depA.id).length === 2)
    check('detail carries tracked time', getTaskDetail(depA.id)?.timeTracked === 65)
    updateTimeEntry(te2.id, { duration: 50, note: 'corrected' })
    check(
      'time entry edited',
      timeTrackedFor(depA.id) === 75 && listTimeEntries(depA.id).find((e) => e.id === te2.id)?.note === 'corrected'
    )
    deleteTimeEntry(te1.id)
    check('time entry deleted', timeTrackedFor(depA.id) === 50 && listTimeEntries(depA.id).length === 1)

    // Billing (Phase 10b): the space default seeds from the preset, a task can
    // override it, and the report resolves the effective billing per row.
    check('legal space inherits time billing from its preset', getSpaceDetail(legalSpace.id).billing.mode === 'time')
    check('bare space defaults to no billing', bare.billing.mode === 'none')
    setSpaceBilling(legalSpace.id, { mode: 'time', rate: 200 })
    check('space billing rate persists', getSpaceDetail(legalSpace.id).billing.rate === 200)
    const beforeOverride = timeReport({ spaceId: legalSpace.id }).find((r) => r.taskId === depA.id)
    check(
      'report buckets minutes by task and week',
      beforeOverride?.minutes === 50 &&
        typeof beforeOverride?.weekStart === 'string' &&
        beforeOverride.weekStart.length === 10 &&
        timeReport({ spaceId: legalSpace.id }).filter((r) => r.taskId === depA.id).length === 1
    )
    check('report inherits the space billing default', beforeOverride?.billingMode === 'time' && beforeOverride?.billingRate === 200)
    updateTask(depA.id, { billingMode: 'job', billingRate: 250 })
    check('task billing override saved', getTaskDetail(depA.id)?.billingMode === 'job' && getTaskDetail(depA.id)?.billingRate === 250)
    const afterOverride = timeReport({ spaceId: legalSpace.id }).find((r) => r.taskId === depA.id)
    check('report reflects the task override', afterOverride?.billingMode === 'job' && afterOverride?.billingRate === 250)
    check('report scopes to the space', timeReport({ spaceId: bare.id }).every((r) => r.spaceId === bare.id))
    check('time billing computes hours × rate', computeAmount('time', 200, null, 90) === 300)
    check('job billing is the fixed price', computeAmount('job', 250, null, 90) === 250)
    check('unit billing is units × value', computeAmount('unit', 30, 4, 0) === 120)
    check(
      'no billing yields no amount',
      computeAmount('none', 200, null, 90) === null && computeAmount('time', null, null, 90) === null
    )
    check(
      'resolveBilling falls back to the space then lets the task win',
      JSON.stringify(resolveBilling(null, null, 'time', 200)) === JSON.stringify({ mode: 'time', rate: 200 }) &&
        resolveBilling('job', 250, 'time', 200).mode === 'job'
    )

    // Activity log
    const acts = listTaskActivity(depA.id).map((a) => a.action)
    check('activity records creation and status change', acts.includes('created') && acts.includes('status changed'))
    check('global feed sees task activity', listActivity(50).some((a) => a.itemType === 'task'))

    // Templates
    addSubtask(depC.id, 'Confirm filing receipt')
    addTag(depC.id, createTag(legalSpace.id, 'filing').id)
    const tmpl = createTemplate(depC.id, 'Filing intake')
    check('template listed for the space', listTemplates(legalSpace.id).some((t) => t.id === tmpl.id))
    const fromTmpl = applyTemplate(tmpl.id)
    check('applied template reproduces structure', fromTmpl.title === 'File submission' && listSubtasks(fromTmpl.id).some((s) => s.title === 'Confirm filing receipt') && listTaskTags(fromTmpl.id).some((t) => t.name === 'filing'))
    deleteTemplate(tmpl.id)
    check('template deleted', listTemplates(legalSpace.id).every((t) => t.id !== tmpl.id))

    // Files
    check('kind detection by extension', deriveKind('a.pdf') === 'pdf' && deriveKind('b.csv') === 'csv')
    const tmp = join(paths.root, 'selftest-source.txt')
    writeFileSync(tmp, 'hello kaseki')
    const ingested = ingestFile(tmp, 'notes.txt')
    check('file ingested with metadata', ingested.name === 'notes.txt' && ingested.size === 12 && ingested.kind === 'text')
    check('ingested blob readable', readFileSync(join(paths.uploads, ingested.hash)).toString() === 'hello kaseki')
    const again = ingestFile(tmp, 'duplicate.txt')
    check('identical content deduplicates', again.id === ingested.id)
    check('file listed and fetchable', listFiles().some((f) => f.id === ingested.id) && getFile(ingested.id)?.hash === ingested.hash)

    // Annotations
    const bookmark = createAnnotation({ fileId: ingested.id, page: 2, type: 'bookmark', content: 'Witness statement' })
    const highlight = createAnnotation({
      fileId: ingested.id,
      page: 1,
      type: 'highlight',
      position: { x: 10, y: 20, w: 100, h: 14 },
      color: '#EF9F27'
    })
    const anns = listAnnotations(ingested.id)
    check('annotations created and listed', anns.length === 2)
    check(
      'bookmark stores label, highlight stores position',
      anns.find((a) => a.type === 'bookmark')?.content === 'Witness statement' &&
        anns.find((a) => a.type === 'highlight')?.position?.w === 100
    )
    updateAnnotation(highlight.id, { color: '#E24B4A' })
    check('annotation update persists', listAnnotations(ingested.id).find((a) => a.id === highlight.id)?.color === '#E24B4A')
    deleteAnnotation(bookmark.id)
    check('annotation delete removes one', listAnnotations(ingested.id).length === 1)

    // Annotated PDF export
    const pdfSource = join(paths.root, 'selftest-source.pdf')
    writeFileSync(pdfSource, minimalPdf())
    const pdfRec = ingestFile(pdfSource, 'sample.pdf')
    createAnnotation({
      fileId: pdfRec.id,
      page: 1,
      type: 'highlight',
      position: { x: 0.1, y: 0.1, w: 0.5, h: 0.05 },
      color: '#EF9F27'
    })
    createAnnotation({ fileId: pdfRec.id, page: 1, type: 'note', position: { x: 0.6, y: 0.2 }, content: 'check' })
    const annotated = await buildAnnotatedPdf(pdfRec.id)
    check(
      'annotated PDF builds and is larger',
      annotated !== null &&
        Buffer.from(annotated.subarray(0, 5)).toString() === '%PDF-' &&
        annotated.length > minimalPdf().length
    )
    check('annotated export only for PDFs', (await buildAnnotatedPdf(ingested.id)) === null)

    // Bundles
    const fileA = ingestFile((writeFileSync(join(paths.root, 'a.txt'), 'A'), join(paths.root, 'a.txt')), 'a.txt')
    const fileB = ingestFile((writeFileSync(join(paths.root, 'b.txt'), 'B'), join(paths.root, 'b.txt')), 'b.txt')
    const bundle = createBundle('Hearing bundle')
    addFileToBundle(bundle.id, fileA.id)
    addFileToBundle(bundle.id, fileB.id)
    addFileToBundle(bundle.id, fileA.id) // dedup
    check('bundle holds ordered references without dupes', getBundle(bundle.id)?.files.length === 2)
    check('bundle file order', getBundle(bundle.id)?.files[0].id === fileA.id)
    moveBundleFile(bundle.id, fileB.id, -1)
    check('bundle reorder', getBundle(bundle.id)?.files[0].id === fileB.id)
    removeFileFromBundle(bundle.id, fileA.id)
    check('bundle remove', getBundle(bundle.id)?.files.length === 1)
    check('bundle list with count', listBundles().find((b) => b.id === bundle.id)?.fileCount === 1)

    // Combined-PDF export merges the bundle (a PDF page + a rendered text page)
    addFileToBundle(bundle.id, pdfRec.id)
    addFileToBundle(bundle.id, fileB.id)
    const combined = await buildCombinedPdf(bundle.id)
    check(
      'combined bundle PDF builds',
      combined !== null && Buffer.from(combined.subarray(0, 5)).toString() === '%PDF-'
    )

    // Calendar events + recurrence
    const win = (s: string, e: string): [string, string] => [s, e]
    createEvent({ title: 'One-off', start: '2026-07-15T09:00:00.000Z' })
    check(
      'single event in range, not out',
      expandEvents(...win('2026-07-14T00:00:00.000Z', '2026-07-16T00:00:00.000Z')).length === 1 &&
        expandEvents(...win('2026-08-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z')).length === 0
    )
    const weekly = createEvent({
      title: 'Standup',
      start: '2026-07-13T09:00:00.000Z',
      end: '2026-07-13T09:30:00.000Z',
      recurrenceRule: 'FREQ=WEEKLY'
    })
    const fourWeeks = expandEvents('2026-07-13T00:00:00.000Z', '2026-08-10T00:00:00.000Z', null).filter(
      (o) => o.masterId === weekly.id
    )
    check('weekly expands to 4 occurrences', fourWeeks.length === 4)
    check('occurrence carries end via duration', fourWeeks[1].end === '2026-07-20T09:30:00.000Z')
    const sixHourly = createEvent({ title: 'Feed', start: '2026-07-13T00:00:00.000Z', recurrenceRule: 'FREQ=HOURLY;INTERVAL=6' })
    check(
      'sub-daily 6-hourly expands to 4/day',
      expandEvents('2026-07-13T00:00:00.000Z', '2026-07-13T23:59:00.000Z', null).filter((o) => o.masterId === sixHourly.id).length === 4
    )
    cancelOccurrence(weekly.id, '2026-07-20T09:00:00.000Z')
    check(
      'cancelled occurrence is skipped',
      expandEvents('2026-07-13T00:00:00.000Z', '2026-08-10T00:00:00.000Z', null).filter((o) => o.masterId === weekly.id).length === 3
    )
    setOverride(weekly.id, '2026-07-27T09:00:00.000Z', { title: 'Standup (moved)', start: '2026-07-27T14:00:00.000Z' })
    const overridden = expandEvents('2026-07-27T00:00:00.000Z', '2026-07-28T00:00:00.000Z', null).find(
      (o) => o.masterId === weekly.id
    )
    check('overridden occurrence reflects edit', overridden?.title === 'Standup (moved)' && overridden?.occurrenceStart === '2026-07-27T14:00:00.000Z')
    setOccurrenceCompleted(weekly.id, '2026-08-03T09:00:00.000Z', true)
    check(
      'occurrence marked completed',
      expandEvents('2026-08-03T00:00:00.000Z', '2026-08-04T00:00:00.000Z', null).find((o) => o.masterId === weekly.id)?.completed === true
    )
    splitSeries(weekly.id, '2026-08-03T09:00:00.000Z', {
      title: 'Standup (new time)',
      start: '2026-08-03T10:00:00.000Z',
      recurrenceRule: 'FREQ=WEEKLY'
    })
    const afterSplit = expandEvents('2026-07-13T00:00:00.000Z', '2026-08-17T00:00:00.000Z', null)
    check(
      'split ends the old series before the cut',
      afterSplit.filter((o) => o.masterId === weekly.id && o.occurrenceStart >= '2026-08-03').length === 0
    )
    check('split starts a new series at the cut', afterSplit.some((o) => o.title === 'Standup (new time)'))

    const daily = createEvent({ title: 'Meds', start: '2026-09-01T08:00:00.000Z', recurrenceRule: 'FREQ=DAILY' })
    const range = ['2026-09-01T00:00:00.000Z', '2026-09-06T00:00:00.000Z'] as const
    check('daily expands to 5 before truncation', expandEvents(range[0], range[1], null).filter((o) => o.masterId === daily.id).length === 5)
    truncateSeries(daily.id, '2026-09-03T08:00:00.000Z')
    const afterTruncate = expandEvents(range[0], range[1], null).filter((o) => o.masterId === daily.id)
    check('truncate ends the series at the cut', afterTruncate.length === 2)
    check('truncate spawns no replacement series', !expandEvents(range[0], '2026-09-30T00:00:00.000Z', null).some((o) => o.masterId !== daily.id && o.title === 'Meds'))

    const ics = buildIcs(
      [
        {
          id: 7,
          title: 'Stand; up',
          description: 'note, line1\nline2',
          start: '2026-07-13T09:00:00.000Z',
          end: '2026-07-13T09:30:00.000Z',
          allDay: false,
          location: 'Room A',
          recurrenceRule: 'FREQ=WEEKLY',
          tz: 'UTC',
          exdates: ['2026-07-20T09:00:00.000Z'],
          overrides: [
            {
              recurrenceId: '2026-07-27T09:00:00.000Z',
              title: 'Moved',
              description: null,
              start: '2026-07-27T14:00:00.000Z',
              end: '2026-07-27T14:30:00.000Z',
              allDay: false,
              location: null
            }
          ]
        },
        { id: 8, title: 'Holiday', description: null, start: '2026-07-15T00:00:00.000Z', end: null, allDay: true, location: null, recurrenceRule: null, tz: 'UTC', exdates: [], overrides: [] }
      ],
      'Test',
      '20260101T000000Z'
    )
    check('ics wraps in VCALENDAR', ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.trimEnd().endsWith('END:VCALENDAR'))
    check('ics uses CRLF line breaks', ics.includes('\r\n'))
    check('ics emits the RRULE verbatim', ics.includes('RRULE:FREQ=WEEKLY'))
    check('ics recurring DTSTART carries its TZID', ics.includes('DTSTART;TZID=UTC:20260713T090000'))
    check('ics all-day DTSTART is a floating DATE', ics.includes('DTSTART;VALUE=DATE:'))
    check('ics escapes TEXT special characters', ics.includes('SUMMARY:Stand\\; up') && ics.includes('DESCRIPTION:note\\, line1\\nline2'))
    check('ics emits EXDATE for cancellations', ics.includes('EXDATE;TZID=UTC:20260720T090000'))
    check('ics override carries a RECURRENCE-ID', ics.includes('RECURRENCE-ID;TZID=UTC:20260727T090000'))
    check('exportIcs reads events from the database', exportIcs('All', '20260101T000000Z', null).includes('BEGIN:VEVENT'))

    // Knowledge area — pages, tree, content
    check('pmText flattens a document', pmText(pmDoc('Hello', 'World')) === 'Hello\nWorld')
    check('knowledge starts empty', listTree().length === 0)
    const procedures = createPage({ title: 'Procedures' })
    const child = createPage({
      title: 'Entry clearance',
      parentId: procedures.id,
      content: pmDoc('Gather the sponsor documents first.')
    })
    check('page created at top level', procedures.parentId === null && procedures.position === 0)
    check('child page records its parent', child.parentId === procedures.id)
    check('content round-trips as JSON', getPage(child.id)?.content?.type === 'doc')
    const sibling = createPage({ title: 'Naturalisation', parentId: procedures.id })
    check('siblings get increasing positions', sibling.position === 1)
    updatePage(child.id, { title: 'Entry clearance (UK)' })
    check('title update persists', getPage(child.id)?.title === 'Entry clearance (UK)')

    // Reorder, reparent, cycle guard
    reorderPage(sibling.id, -1)
    const kids = listTree()
      .filter((p) => p.parentId === procedures.id)
      .sort((a, b) => a.position - b.position)
    check('reorder swaps siblings', kids[0].id === sibling.id)
    check('cannot move a page under its own descendant', movePage(procedures.id, child.id) === false)
    check('reparent to top level succeeds', movePage(child.id, null) === true)
    check('reparented page is now top-level', getPage(child.id)?.parentId === null)

    // Search
    check('search finds a page by body text', searchPages('sponsor').some((h) => h.id === child.id))
    check('search is case-insensitive on titles', searchPages('naturalisation').length === 1)
    check('search returns nothing for a miss', searchPages('zzzznope').length === 0)

    // Cross-linking + backlinks (bidirectional). A distinct file (unique
    // content) so it doesn't deduplicate onto the earlier ingest.
    const refSrc = join(paths.root, 'selftest-reference.txt')
    writeFileSync(refSrc, 'knowledge cross-link reference')
    const noteFile = ingestFile(refSrc, 'reference.txt')
    const link = createLink('knowledge', procedures.id, 'file', noteFile.id)
    check('link created and labelled', link.ref.type === 'file' && link.ref.label === 'reference.txt')
    createLink('knowledge', child.id, 'knowledge', procedures.id)
    check('outgoing lists the linked items', listOutgoing('knowledge', procedures.id).length === 1)
    check(
      'backlinks are read from the other direction',
      listBacklinks('knowledge', procedures.id).some((e) => e.ref.id === child.id)
    )
    check(
      'duplicate links collapse to one row',
      createLink('knowledge', procedures.id, 'file', noteFile.id).linkId === link.linkId
    )
    let selfLinkRejected = false
    try {
      createLink('knowledge', child.id, 'knowledge', child.id)
    } catch {
      selfLinkRejected = true
    }
    check('a page cannot link to itself', selfLinkRejected)
    const candidates = linkCandidates()
    check(
      'link candidates expose existing types',
      candidates.knowledge.length >= 2 && candidates.file.some((f) => f.id === noteFile.id)
    )
    deleteLink(link.linkId)
    check('link delete removes the edge', listOutgoing('knowledge', procedures.id).length === 0)

    // Deleting a page takes its subtree and its links with it
    const trunk = createPage({ title: 'Trunk' })
    const branch = createPage({ title: 'Branch', parentId: trunk.id })
    createLink('knowledge', branch.id, 'file', noteFile.id)
    deletePage(trunk.id)
    check('delete removes the page and its descendants', getPage(branch.id) === null)
    check('delete cleans up the deleted pages links', listBacklinks('file', noteFile.id).length === 0)

    // Markdown export (pure serializer)
    const md = pmToMarkdown(
      {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'plain ' },
              { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
              { type: 'text', text: ' and ' },
              { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://x.test' } }] }
            ]
          },
          {
            type: 'bulletList',
            content: ['one', 'two'].map((t) => ({
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }]
            }))
          },
          {
            type: 'orderedList',
            content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] }
            ]
          },
          {
            type: 'taskList',
            content: [
              { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }] },
              { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'todo' }] }] }
            ]
          },
          { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1' }] },
          { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quote' }] }] },
          { type: 'horizontalRule' }
        ]
      },
      'My page'
    )
    check('md: page title becomes the H1', md.startsWith('# My page\n'))
    check('md: heading level maps to ##', md.includes('## Heading'))
    check('md: bold and links render inline', md.includes('**bold**') && md.includes('[link](https://x.test)'))
    check('md: bullet list', md.includes('- one\n- two'))
    check('md: ordered list numbers items', md.includes('1. first'))
    check('md: task list checkboxes', md.includes('- [x] done') && md.includes('- [ ] todo'))
    check('md: fenced code block', md.includes('```\nconst x = 1\n```'))
    check('md: blockquote prefix', md.includes('> quote'))
    check('md: horizontal rule', md.includes('\n---'))
    check(
      'md: escapes markdown specials in text',
      pmToMarkdown({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a*b[c]' }] }]
      }).includes('a\\*b\\[c\\]')
    )

    // Global search (Part 15) — the cross-content aggregator
    check('search ignores sub-minimum queries', globalSearch('e').length === 0)
    const ev = globalSearch('evidence')
    check('search finds a task by title', ev.some((h) => h.type === 'task' && /evidence/i.test(h.title)))
    check('search finds a file by filename', ev.some((h) => h.type === 'file' && /evidence/i.test(h.title)))
    check('search groups several content types', new Set(ev.map((h) => h.type)).size >= 2)
    check(
      'search hit carries the owning space and accent',
      (() => {
        const t = ev.find((h) => h.type === 'task')
        return t?.spaceName === "Sample Legal" && typeof t?.accentColor === 'string'
      })()
    )
    check('search matches a knowledge page', globalSearch('naturalisation').some((h) => h.type === 'knowledge'))
    check(
      'search returns a snippet for a body match',
      (() => {
        const k = globalSearch('sponsor').find((h) => h.type === 'knowledge')
        return !!k && typeof k.snippet === 'string' && k.snippet.length > 0
      })()
    )
    check('search finds a space by name', globalSearch('Sample').some((h) => h.type === 'space' && /Legal/i.test(h.title)))
    check(
      'search finds a subtask routed to its parent task',
      (() => {
        const s = globalSearch('receipt').find((h) => h.type === 'subtask')
        return !!s && typeof s.parentId === 'number'
      })()
    )
    check('search is case-insensitive', globalSearch('EVIDENCE').some((h) => h.type === 'task'))
    check('vault results are excluded without an unlocked list', ev.every((h) => h.type !== 'vault'))

    // Crash reporting (Part 14 #12) — opt-in, sanitised
    check('crash reporting defaults to off', crashConfig().enabled === false)
    const dsn = parseDsn('https://abc123@o42.ingest.sentry.io/9001')
    check(
      'sentry dsn parses to a store url and key',
      dsn?.key === 'abc123' && dsn?.storeUrl === 'https://o42.ingest.sentry.io/api/9001/store/'
    )
    check('a malformed dsn is rejected', parseDsn('not-a-dsn') === null)
    const crashEvent = buildEvent(new Error(`failed at ${homedir()}/secret.txt`), 'main')
    check('crash event carries the expected shape', typeof (crashEvent as { event_id?: unknown }).event_id === 'string')
    check('crash report scrubs the home directory', !JSON.stringify(crashEvent).includes(homedir()))

    // Vault crypto (Part 11) — pure primitives, no database
    check('bip39 wordlist has 2048 words', BIP39_WORDLIST.length === 2048)
    check(
      'bip39 wordlist is sorted and unique',
      BIP39_WORDLIST.every((w, i, a) => i === 0 || a[i - 1] < w)
    )
    check(
      'bip39 wordlist is unique in its first four characters',
      new Set(BIP39_WORDLIST.map((w) => w.slice(0, 4))).size === 2048
    )

    const vk = randomKey()
    const vsealed = seal(vk, Buffer.from('account 12345678'))
    check('gcm round-trips', open(vk, vsealed).toString() === 'account 12345678')
    check('gcm rejects the wrong key', tryOpen(randomKey(), vsealed) === null)
    const vtampered = Buffer.from(vsealed)
    vtampered[vtampered.length - 1] ^= 0xff
    check('gcm rejects tampered ciphertext', tryOpen(vk, vtampered) === null)
    check('gcm uses a fresh IV each call', !seal(vk, Buffer.from('x')).equals(seal(vk, Buffer.from('x'))))

    // Envelope: a DEK wrapped by an independent passcode key and recovery key,
    // recoverable through either, and a wrong passcode fails to unwrap.
    const dek = randomKey()
    const saltP = randomSalt()
    const saltR = randomSalt()
    const kekPass = await deriveKeyFromPasscode('hunter2', saltP)
    const recEntropy = mnemonicToEntropy(generateMnemonic())
    const kekRec = deriveKeyFromEntropy(recEntropy, saltR)
    const wrappedByPass = seal(kekPass, dek)
    const wrappedByRec = seal(kekRec, dek)
    check('dek unwraps via the passcode key', open(kekPass, wrappedByPass).equals(dek))
    check('dek unwraps via the recovery key', open(kekRec, wrappedByRec).equals(dek))
    check('wrong passcode fails to unwrap the dek', tryOpen(await deriveKeyFromPasscode('wrong', saltP), wrappedByPass) === null)
    check('derived key is 256-bit', kekPass.length === KEY_BYTES)
    check('scrypt is deterministic for the same passcode and salt', (await deriveKeyFromPasscode('pw', saltP)).equals(await deriveKeyFromPasscode('pw', saltP)))
    check('scrypt diverges on a different salt', !(await deriveKeyFromPasscode('pw', saltP)).equals(await deriveKeyFromPasscode('pw', saltR)))

    check('generated mnemonic has 24 words', generateMnemonic().split(' ').length === 24)
    check('mnemonic round-trips through entropy', mnemonicToEntropy(entropyToMnemonic(Buffer.alloc(32, 7))).equals(Buffer.alloc(32, 7)))
    const zeroVec = entropyToMnemonic(Buffer.alloc(32, 0))
    check('bip39 known vector: zero entropy → abandon… art', zeroVec.startsWith('abandon abandon') && zeroVec.endsWith(' art'))
    check('mnemonic rejects a bad checksum', !validateMnemonic(`${'abandon '.repeat(23)}abandon`))
    check('mnemonic rejects an unknown word', !validateMnemonic(`${'zzzz '.repeat(23)}art`))

    // Vault store (Part 11) — create, encrypt, lock/unlock, change, recover
    check('vault starts absent', vaultStatus() === 'absent')
    const recovery = (await createVault('open sesame')).mnemonic
    check('createVault returns a 24-word phrase and unlocks', recovery.split(' ').length === 24 && vaultStatus() === 'unlocked')

    const vaultSrc = join(paths.root, 'selftest-secret.txt')
    writeFileSync(vaultSrc, 'sort code 12-34-56')
    const secret = addFile(vaultSrc, 'bank.txt')
    check('file added with decrypted metadata', secret.name === 'bank.txt' && secret.size === 18 && secret.kind === 'text')
    check('vault lists the file', listVaultFiles().some((f) => f.id === secret.id))
    check('identical content deduplicates by skip', addFile(vaultSrc, 'dupe.txt').id === secret.id && listVaultFiles().length === 1)
    check('blob on disk is ciphertext, not the plaintext', !readFileSync(join(paths.sensitive, (getDb().prepare('SELECT blob_name FROM vault_files WHERE id = ?').get(secret.id) as { blob_name: string }).blob_name)).includes('sort code'))
    check('decrypted bytes round-trip', readVaultFile(secret.id)?.bytes.toString() === 'sort code 12-34-56')
    renameVaultFile(secret.id, 'account.txt')
    check('rename re-encrypts the name', listVaultFiles()[0].name === 'account.txt')

    lockVault()
    check('lock returns to locked', vaultStatus() === 'locked')
    let lockedReadThrew = false
    try {
      listVaultFiles()
    } catch {
      lockedReadThrew = true
    }
    check('locked vault refuses to list', lockedReadThrew)
    check('wrong passcode does not unlock', (await unlockVault('wrong')) === false && vaultStatus() === 'locked')
    check('correct passcode unlocks', (await unlockVault('open sesame')) === true && listVaultFiles()[0].name === 'account.txt')

    check('change passcode succeeds with the old one', (await changePasscode('open sesame', 'new passphrase')) === true)
    lockVault()
    check('old passcode no longer unlocks', (await unlockVault('open sesame')) === false)
    check('new passcode unlocks', (await unlockVault('new passphrase')) === true)

    check('recovery phrase resets the passcode', (await resetWithRecovery(recovery, 'recovered pass')) === true)
    check('a wrong recovery phrase is rejected', (await resetWithRecovery(generateMnemonic(), 'nope')) === false)
    lockVault()
    check('the reset passcode unlocks', (await unlockVault('recovered pass')) === true)
    check('files survive passcode change and recovery', readVaultFile(secret.id)?.bytes.toString() === 'sort code 12-34-56')

    deleteVaultFile(secret.id)
    check('delete removes the file and its blob', listVaultFiles().length === 0)

    // ————— v0.2.0 fixes —————

    // Timezone-aware recurrence (the DST fix). A weekly 14:00 Europe/London
    // event created in June (13:00Z under BST) must land at 14:00 London on
    // both sides of the 25 Oct 2026 clock change — 13:00Z before, 14:00Z
    // after. 0.1.0 recurred at a fixed UTC instant and drifted an hour.
    check('tz validity: Europe/London yes, Narnia no', isValidTz('Europe/London') && !isValidTz('Mars/Olympus'))
    const octSlots = occurrencesBetween('FREQ=WEEKLY', '2026-06-03T13:00:00.000Z', 'Europe/London', new Date('2026-10-01T00:00:00Z'), new Date('2026-10-24T00:00:00Z'))
    const novSlots = occurrencesBetween('FREQ=WEEKLY', '2026-06-03T13:00:00.000Z', 'Europe/London', new Date('2026-11-01T00:00:00Z'), new Date('2026-11-30T00:00:00Z'))
    check('recurrence holds 14:00 London wall time before the clock change', octSlots.length > 0 && octSlots.every((d) => d.toISOString().endsWith('T13:00:00.000Z')))
    check('recurrence holds 14:00 London wall time after the clock change', novSlots.length > 0 && novSlots.every((d) => d.toISOString().endsWith('T14:00:00.000Z')))
    check('instantFromWall inverts wall-time conversion across DST', instantFromWall({ y: 2026, mo: 11, d: 4, h: 14, mi: 0, s: 0 }, 'Europe/London').toISOString() === '2026-11-04T14:00:00.000Z' && instantFromWall({ y: 2026, mo: 6, d: 3, h: 14, mi: 0, s: 0 }, 'Europe/London').toISOString() === '2026-06-03T13:00:00.000Z')
    check('floating conversion carries wall components', floatingFromInstant(new Date('2026-06-03T13:00:00.000Z'), 'Europe/London').toISOString() === '2026-06-03T14:00:00.000Z')
    const capped = capRuleBefore('FREQ=WEEKLY;INTERVAL=2', 'Europe/London', '2026-11-04T14:00:00.000Z')
    check('capRuleBefore preserves the interval while capping', capped.includes('INTERVAL=2') && capped.includes('UNTIL='))
    check('a capped rule stops before the cut', occurrencesBetween(capped, '2026-06-03T13:00:00.000Z', 'Europe/London', new Date('2026-11-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z')).length === 0)
    check('shiftInstantByWallDelta applies wall minutes across the boundary', shiftInstantByWallDelta('2026-11-04T14:00:00.000Z', 'Europe/London', '2026-06-03T13:00:00.000Z', '2026-06-03T13:30:00.000Z') === '2026-11-04T14:30:00.000Z')

    const londonCall = createEvent({ title: 'Client call', start: '2026-06-03T13:00:00.000Z', end: '2026-06-03T14:00:00.000Z', recurrenceRule: 'FREQ=WEEKLY', tz: 'Europe/London' })
    const novCalls = expandEvents('2026-11-01T00:00:00.000Z', '2026-11-15T00:00:00.000Z', null).filter((o) => o.masterId === londonCall.id)
    check('expandEvents keeps the event at 14:00 London after DST', novCalls.length === 2 && novCalls.every((o) => o.occurrenceStart.endsWith('T14:00:00.000Z')))
    check('a stored event reports its timezone', getEvent(londonCall.id)?.tz === 'Europe/London')

    // Completing one occurrence records that occurrence's own end — 0.1.0
    // copied the series' first-ever end, so a completed February slot of a
    // January series "ended" weeks before it started.
    setOccurrenceCompleted(londonCall.id, novCalls[0].occurrenceStart, true)
    const completedCall = expandEvents('2026-11-01T00:00:00.000Z', '2026-11-15T00:00:00.000Z', null).find((o) => o.masterId === londonCall.id && o.completed)
    check('completed occurrence keeps its own end time', completedCall != null && completedCall.end === new Date(new Date(completedCall.occurrenceStart).getTime() + 3_600_000).toISOString())

    // Series edits keep exceptions attached. Cancel one slot, move the whole
    // series 30 wall-minutes: the cancellation must move with it, not detach
    // and resurrect (the 0.1.0 behaviour). Changing the rule itself drops the
    // now-meaningless exceptions deliberately.
    const shifty = createEvent({ title: 'Shifty', start: '2026-06-03T13:00:00.000Z', end: '2026-06-03T14:00:00.000Z', recurrenceRule: 'FREQ=WEEKLY', tz: 'Europe/London' })
    cancelOccurrence(shifty.id, '2026-11-04T14:00:00.000Z')
    check('cancelled slot is skipped before the series edit', !expandEvents('2026-11-01T00:00:00.000Z', '2026-11-08T00:00:00.000Z', null).some((o) => o.masterId === shifty.id))
    updateEvent(shifty.id, { title: 'Shifty', start: '2026-06-03T13:30:00.000Z', end: '2026-06-03T14:30:00.000Z', recurrenceRule: 'FREQ=WEEKLY', tz: 'Europe/London' })
    check('cancelled slot stays cancelled after the series start moves', !expandEvents('2026-11-01T00:00:00.000Z', '2026-11-08T00:00:00.000Z', null).some((o) => o.masterId === shifty.id))
    check('other occurrences shifted with the series', expandEvents('2026-11-08T00:00:00.000Z', '2026-11-15T00:00:00.000Z', null).some((o) => o.masterId === shifty.id && o.occurrenceStart === '2026-11-11T14:30:00.000Z'))
    updateEvent(shifty.id, { title: 'Shifty', start: '2026-06-03T13:30:00.000Z', end: '2026-06-03T14:30:00.000Z', recurrenceRule: 'FREQ=DAILY', tz: 'Europe/London' })
    check('a rule change drops the exception children', (getDb().prepare('SELECT count(*) AS n FROM events WHERE recurrence_parent_id = ?').get(shifty.id) as { n: number }).n === 0)

    // Range intersection: events that *overlap* the window show, not only
    // those that *start* in it. An overnight session shows on both days.
    const overnight = createEvent({ title: 'Overnight prep', start: '2026-08-10T23:00:00.000Z', end: '2026-08-11T01:00:00.000Z' })
    check('an overnight event appears in the next day\'s window', expandEvents('2026-08-11T00:00:00.000Z', '2026-08-11T23:59:59.000Z', null).some((o) => o.masterId === overnight.id))
    const lateDaily = createEvent({ title: 'Late daily', start: '2026-08-01T23:30:00.000Z', end: '2026-08-02T00:30:00.000Z', recurrenceRule: 'FREQ=DAILY', tz: 'UTC' })
    check('a recurring occurrence spanning the window start is found', expandEvents('2026-08-05T00:00:00.000Z', '2026-08-05T12:00:00.000Z', null).some((o) => o.masterId === lateDaily.id && o.occurrenceStart === '2026-08-04T23:30:00.000Z'))

    // deleteEvent cleans its cross-links (they previously lingered forever).
    const linkedEvent = createEvent({ title: 'Linked hearing', start: '2026-09-01T09:00:00.000Z' })
    const linkedPage = createPage({ title: 'Hearing notes' })
    createLink('event', linkedEvent.id, 'knowledge', linkedPage.id)
    deleteEvent(linkedEvent.id)
    check('deleting an event removes its links', listBacklinks('knowledge', linkedPage.id).length === 0)
    deletePage(linkedPage.id)

    // The archived shelf: archiving hides a task from the list and search but
    // keeps it reachable through listArchivedTasks, and unarchive restores it.
    // 0.1.0 had the boolean with no read path — a one-way trapdoor.
    const shelfSpace = createSpace({ name: 'Shelf' })
    const shelfTask = createTask({ spaceId: shelfSpace.id, title: 'Old matter' })
    updateTask(shelfTask.id, { archived: true })
    check('archived task leaves the active list', !listTasks(shelfSpace.id).some((t) => t.id === shelfTask.id))
    check('archived task appears on the shelf', listArchivedTasks(shelfSpace.id).some((t) => t.id === shelfTask.id))
    updateTask(shelfTask.id, { archived: false })
    check('unarchive restores the task to the list', listTasks(shelfSpace.id).some((t) => t.id === shelfTask.id))

    // Migration 008's status cleanup: status-'Archived' tasks convert to the
    // boolean and 'Archived' leaves every status set, with 'Done' guaranteed.
    getDb().prepare("UPDATE tasks SET status = 'Archived' WHERE id = ?").run(shelfTask.id)
    getDb().prepare("UPDATE spaces SET preferences = json_set(COALESCE(preferences, '{}'), '$.statusSet', json(?)) WHERE id = ?").run(JSON.stringify(['To start', 'Archived']), shelfSpace.id)
    normalizeArchivedStatuses(getDb())
    const normalizedTask = getTask(shelfTask.id)
    check('status-Archived converts to the archived boolean', normalizedTask?.archived === true && normalizedTask?.status === null)
    const normalizedSet = getSpaceDetail(shelfSpace.id).statusSet
    check('status sets lose Archived and keep Done', !normalizedSet.includes('Archived') && normalizedSet.includes('Done'))
    check('universal statuses no longer offer Archived', !UNIVERSAL_STATUSES.includes('Archived'))
    check('every preset status set includes Done', PRESETS.every((pr) => pr.statuses.includes('Done')))

    // completed_at + billing month attribution: a Done transition stamps the
    // task; fixed-price work counts once, in that month; a fixed-price task
    // with no tracked time still appears in the report. 0.1.0 re-counted the
    // full price in every month with a time entry and hid untracked tasks.
    const firmSpace = createSpace({ name: 'Firm' })
    setSpaceBilling(firmSpace.id, { mode: 'job', rate: 5000 })
    const fixedFee = createTask({ spaceId: firmSpace.id, title: 'Fixed-fee matter' })
    check('completed_at starts null', getTask(fixedFee.id)?.completedAt === null)
    updateTask(fixedFee.id, { status: 'Done' })
    check('entering Done stamps completed_at', getTask(fixedFee.id)?.completedAt !== null)
    updateTask(fixedFee.id, { status: 'To start' })
    check('leaving Done clears completed_at', getTask(fixedFee.id)?.completedAt === null)
    updateTask(fixedFee.id, { status: 'Done' })
    getDb().prepare('UPDATE tasks SET completed_at = ? WHERE id = ?').run('2026-06-15T10:00:00.000Z', fixedFee.id)
    const firmReport = timeReport({ spaceId: firmSpace.id })
    const fixedRow = firmReport.find((r) => r.taskId === fixedFee.id)
    check('an untracked fixed-price task appears in the report', fixedRow != null && fixedRow.weekStart === null && fixedRow.minutes === 0 && fixedRow.billingMode === 'job')
    check('report rows carry completed_at', fixedRow?.completedAt === '2026-06-15T10:00:00.000Z')
    const juneW = ['2026-06-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'] as const
    const julyW = ['2026-07-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'] as const
    check('fixed price counts in its completion month', computeWindowAmount('job', 5000, null, 0, '2026-06-15T10:00:00.000Z', juneW[0], juneW[1]) === 5000)
    check('fixed price does not double-count in other months', computeWindowAmount('job', 5000, null, 240, '2026-06-15T10:00:00.000Z', julyW[0], julyW[1]) === null)
    check('an incomplete fixed-price task adds nothing to a month', computeWindowAmount('job', 5000, null, 240, null, juneW[0], juneW[1]) === null)
    check('all-time still counts fixed price regardless of completion', computeWindowAmount('job', 5000, null, 0, null, null, null) === 5000)
    check('time-based billing is unaffected by completion month', computeWindowAmount('time', 60, null, 90, null, juneW[0], juneW[1]) === 90)

    // saveNote is an upsert with a throttled activity entry — a minute of
    // autosaves previously wrote a delete/insert churn plus one 'note
    // updated' row per flush.
    saveNote(fixedFee.id, pmDoc('draft 1') as never)
    saveNote(fixedFee.id, pmDoc('draft 2') as never)
    check('saveNote keeps a single note row', (getDb().prepare('SELECT count(*) AS n FROM task_notes WHERE task_id = ?').get(fixedFee.id) as { n: number }).n === 1)
    check('note autosaves throttle their activity entries', (getDb().prepare("SELECT count(*) AS n FROM activity_log WHERE item_type = 'task' AND item_id = ? AND action = 'note updated'").get(fixedFee.id) as { n: number }).n === 1)
    check('the surviving note is the latest save', pmText(getNote(fixedFee.id) as never) === 'draft 2')

    // deleteTask removes its activity rows (they previously fed the home feed
    // as permanent orphans) — and the feed itself resolves titles.
    const feedRows = listActivity(50)
    check('activity entries resolve their task titles', feedRows.some((a) => a.itemId === fixedFee.id && a.title === 'Fixed-fee matter' && a.spaceName === 'Firm'))
    deleteTask(fixedFee.id)
    check('deleting a task clears its activity rows', (getDb().prepare("SELECT count(*) AS n FROM activity_log WHERE item_type = 'task' AND item_id = ?").get(fixedFee.id) as { n: number }).n === 0)

    // Spaces stopped being immutable: rename (with duplicate auto-suffix),
    // cheatsheet and status edits (Done pinned), archive round-trip, and a
    // full-cascade delete.
    const dupe = createSpace({ name: 'Firm' })
    check('duplicate space names auto-suffix', dupe.name === 'Firm 2')
    updateSpace(dupe.id, { name: 'Chambers', cheatsheet: 'Counsel notes', statusSet: ['Open', 'Closed'] })
    const editedSpace = getSpaceDetail(dupe.id)
    check('updateSpace renames and writes the cheatsheet', editedSpace.name === 'Chambers' && editedSpace.cheatsheet === 'Counsel notes')
    check('status edits always keep Done', editedSpace.statusSet.join('|') === 'Open|Closed|Done')
    archiveSpace(dupe.id, true)
    check('archived space leaves the home list', !listSpaces().some((sp) => sp.id === dupe.id))
    check('archived space appears in the archived list', listArchivedSpaces().some((sp) => sp.id === dupe.id))
    archiveSpace(dupe.id, false)
    check('unarchive restores the space', listSpaces().some((sp) => sp.id === dupe.id))

    const doomed = createSpace({ name: 'Doomed' })
    const doomedTask = createTask({ spaceId: doomed.id, title: 'Doomed task' })
    addSubtask(doomedTask.id, 'Doomed subtask')
    addTimeEntry({ taskId: doomedTask.id, startAt: '2026-06-01T12:00:00.000Z', duration: 30 })
    const doomedTag = createTag(doomed.id, 'doom', null)
    addTag(doomedTask.id, doomedTag.id)
    const doomedEvent = createEvent({ title: 'Doomed event', start: '2026-06-02T09:00:00.000Z', spaceId: doomed.id, recurrenceRule: 'FREQ=DAILY', tz: 'UTC' })
    cancelOccurrence(doomedEvent.id, '2026-06-03T09:00:00.000Z')
    createUrlItem(doomed.id, 'Doomed link', 'example.com')
    deleteSpace(doomed.id)
    const countIn = (sql: string, id: number): number => (getDb().prepare(sql).get(id) as { n: number }).n
    check('deleteSpace removes its tasks and their satellites',
      countIn('SELECT count(*) AS n FROM tasks WHERE space_id = ?', doomed.id) === 0 &&
      countIn('SELECT count(*) AS n FROM subtasks WHERE task_id = ?', doomedTask.id) === 0 &&
      countIn('SELECT count(*) AS n FROM time_entries WHERE task_id = ?', doomedTask.id) === 0 &&
      countIn('SELECT count(*) AS n FROM tags WHERE space_id = ?', doomed.id) === 0)
    check('deleteSpace removes its events, exceptions, and launcher items',
      countIn('SELECT count(*) AS n FROM events WHERE space_id = ?', doomed.id) === 0 &&
      countIn('SELECT count(*) AS n FROM events WHERE recurrence_parent_id = ?', doomedEvent.id) === 0 &&
      countIn('SELECT count(*) AS n FROM launcher_items WHERE space_id = ?', doomed.id) === 0)

    // Files gained rename and delete; dedup honours the newest display name.
    const fSrc = join(paths.root, 'selftest-brief.txt')
    writeFileSync(fSrc, 'grounds of appeal')
    const brief = ingestFile(fSrc, 'brief-v1.txt')
    const rededup = ingestFile(fSrc, 'brief-final.txt')
    check('re-ingesting identical bytes keeps one record but takes the new name', rededup.id === brief.id && getFile(brief.id)?.name === 'brief-final.txt')
    renameFile(brief.id, 'skeleton-argument')
    check('rename without an extension keeps the old mime', getFile(brief.id)?.name === 'skeleton-argument' && getFile(brief.id)?.mime === 'text/plain')
    const briefTaskSpace = createSpace({ name: 'Files' })
    const briefTask = createTask({ spaceId: briefTaskSpace.id, title: 'Appeal' })
    linkFile(briefTask.id, brief.id)
    createAnnotation({ fileId: brief.id, page: 1, type: 'note', content: 'check citation' })
    const briefBlob = join(paths.uploads, brief.hash)
    deleteFile(brief.id)
    check('deleteFile removes the record, references, and blob',
      getFile(brief.id) === null &&
      listTaskFiles(briefTask.id).length === 0 &&
      listAnnotations(brief.id).length === 0 &&
      !readFileExists(briefBlob))

    // Launcher URLs are http(s)-only now — any other scheme was previously
    // stored verbatim and handed to shell.openExternal.
    check('normalizeUrl still prefixes bare domains', normalizeUrl('gov.uk') === 'https://gov.uk')
    let ftpRejected = false
    try {
      normalizeUrl('ftp://files.example.com')
    } catch {
      ftpRejected = true
    }
    check('normalizeUrl rejects non-http schemes', ftpRejected)

    // One CSV parser everywhere: quoted commas, escaped quotes, CRLF — the
    // print path previously split on raw commas and mangled all three.
    const csvRows = parseCsv('name,note\r\n"Smith, J","said ""ok""\nthen left"\r\n')
    check('shared CSV parser handles quoted commas, quotes, and newlines', csvRows.length === 2 && csvRows[1][0] === 'Smith, J' && csvRows[1][1] === 'said "ok"\nthen left')

    // --- v0.3.0: widgets, updates, notifications, backup, search options,
    // export. Pure logic first, then the data layer; nothing here touches the
    // network.

    // Widget layout
    check('widget layout: a missing layout falls back to the default', normalizeLayout(undefined).join() === DEFAULT_WIDGETS.join())
    check('widget layout: an explicit empty layout is respected', normalizeLayout([]).length === 0)
    check(
      'widget layout: unknown types are dropped and duplicates collapse',
      normalizeLayout(['clocks', 'nope', 'notes', 'clocks', 42]).join() === 'clocks,notes'
    )
    check('default widgets leave weather (network) out', !DEFAULT_WIDGETS.includes('weather'))
    check('addWidget appends a new type', addWidget(['notes'], 'clocks').join() === 'notes,clocks')
    check('addWidget ignores a type already present', addWidget(['notes', 'clocks'], 'notes').join() === 'notes,clocks')
    check('removeWidget removes only that type', removeWidget(['notes', 'clocks', 'upcoming'], 'clocks').join() === 'notes,upcoming')
    check('moveWidget moves up', moveWidget(['notes', 'clocks', 'upcoming'], 'clocks', -1).join() === 'clocks,notes,upcoming')
    check('moveWidget moves down', moveWidget(['notes', 'clocks', 'upcoming'], 'clocks', 1).join() === 'notes,upcoming,clocks')
    check('moveWidget off either end is a no-op', moveWidget(['notes', 'clocks'], 'notes', -1).join() === 'notes,clocks' && moveWidget(['notes', 'clocks'], 'clocks', 1).join() === 'notes,clocks')
    check('moveWidget of a missing type is a no-op', moveWidget(['notes'], 'weather', 1).join() === 'notes')
    check('availableWidgets lists what is not placed', availableWidgets(['notes', 'clocks']).join() === WIDGET_TYPES.filter((t) => t !== 'notes' && t !== 'clocks').join())

    // Bookmarks: web links only
    check('bookmark: a bare host is promoted to https', normalizeBookmarkUrl('example.com') === 'https://example.com/')
    check('bookmark: http is kept', normalizeBookmarkUrl(' http://example.com/a?b=1 ') === 'http://example.com/a?b=1')
    check('bookmark: host with a port is a host, not a scheme', normalizeBookmarkUrl('localhost:3000') === 'https://localhost:3000/')
    check('bookmark: file: is rejected', normalizeBookmarkUrl('file:///etc/passwd') === null)
    check('bookmark: javascript: is rejected', normalizeBookmarkUrl('javascript:alert(1)') === null)
    check('bookmark: javascript:// is rejected', normalizeBookmarkUrl('javascript://example.com/%0aalert(1)') === null)
    check('bookmark: other schemes are rejected', normalizeBookmarkUrl('ftp://example.com') === null && normalizeBookmarkUrl('mailto:a@b.com') === null)
    check('bookmark: empty and dotless hosts are rejected', normalizeBookmarkUrl('  ') === null && normalizeBookmarkUrl('intranet') === null)
    const bms = normalizeBookmarks([
      { name: 'Docs', url: 'docs.example.com' },
      { name: 'Bad', url: 'file:///C:/secret' },
      { url: 'https://gov.uk/x' },
      'junk'
    ])
    check(
      'normalizeBookmarks drops unsafe entries and names nameless ones by host',
      bms.length === 2 && bms[0].url === 'https://docs.example.com/' && bms[1].name === 'gov.uk'
    )
    check('normalizeBookmarks of a non-array is empty', normalizeBookmarks('x').length === 0)

    // World clocks
    check('clocks: a missing list falls back to the defaults', normalizeClocks(null).join() === DEFAULT_CLOCKS.join())
    check('clocks: invalid zones and duplicates are dropped', normalizeClocks(['Mars/Olympus', 'Asia/Tokyo', 'Asia/Tokyo']).join() === 'Asia/Tokyo')
    check(
      'clocks: capped at the maximum',
      normalizeClocks(['UTC', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Kolkata', 'America/New_York', 'America/Chicago']).length === CLOCKS_MAX
    )
    check('zoneLabel shows the city', zoneLabel('America/New_York') === 'New York' && zoneLabel('UTC') === 'UTC')
    const janNoon = new Date(Date.UTC(2026, 0, 15, 12))
    const julNoon = new Date(Date.UTC(2026, 6, 15, 12))
    check('zoneOffsetLabel: same zone', zoneOffsetLabel('Europe/London', 'Europe/London', janNoon) === 'same time')
    check('zoneOffsetLabel: half-hour zone in winter', zoneOffsetLabel('Asia/Kolkata', 'Europe/London', janNoon) === '+5h 30m')
    check('zoneOffsetLabel: follows daylight saving', zoneOffsetLabel('Asia/Kolkata', 'Europe/London', julNoon) === '+4h 30m')
    check('zoneOffsetLabel: behind is negative', zoneOffsetLabel('America/New_York', 'Europe/London', janNoon) === '−5h')
    check('zoneOffsetLabel: quarter-hour zone', zoneOffsetLabel('Asia/Kathmandu', 'UTC', janNoon) === '+5h 45m')

    // Weather config gating and labels (no network)
    check('weather config defaults to off with no location', (() => {
      const c = normalizeWeatherConfig(undefined)
      return !c.enabled && c.latitude === null && c.units === 'celsius' && !weatherReady(c)
    })())
    check('weather: on but without a location is not ready', !weatherReady(normalizeWeatherConfig({ enabled: true })))
    check('weather: a location while off is not ready', !weatherReady(normalizeWeatherConfig({ latitude: 51.5, longitude: -0.1 })))
    check('weather: on with a location is ready', weatherReady(normalizeWeatherConfig({ enabled: true, latitude: 51.5, longitude: -0.1 })))
    check('weather: out-of-range latitude clears the location', (() => {
      const c = normalizeWeatherConfig({ enabled: true, latitude: 91, longitude: 0 })
      return c.latitude === null && c.longitude === null && !weatherReady(c)
    })())
    check('weather: half a location is no location', normalizeWeatherConfig({ enabled: true, latitude: 10 }).latitude === null)
    check('weather: only fahrenheit or celsius', normalizeWeatherConfig({ units: 'kelvin' }).units === 'celsius' && normalizeWeatherConfig({ units: 'fahrenheit' }).units === 'fahrenheit')
    check(
      'weatherLabel maps WMO codes',
      weatherLabel(0) === 'Clear' && weatherLabel(3) === 'Overcast' && weatherLabel(63) === 'Rain' &&
        weatherLabel(73) === 'Snow' && weatherLabel(81) === 'Showers' && weatherLabel(95) === 'Thunderstorm' &&
        weatherLabel(150) === 'Unknown'
    )
    const london = normalizeWeatherConfig({ enabled: true, name: 'London', latitude: 51.5, longitude: -0.12 })
    const fUrl = new URL(forecastUrl({ ...london, units: 'fahrenheit' }))
    check(
      'forecastUrl sends the coordinates to Open-Meteo',
      fUrl.origin === 'https://api.open-meteo.com' && fUrl.searchParams.get('latitude') === '51.5' && fUrl.searchParams.get('longitude') === '-0.12'
    )
    check('forecastUrl asks for fahrenheit only when chosen', fUrl.searchParams.get('temperature_unit') === 'fahrenheit' && !new URL(forecastUrl(london)).searchParams.has('temperature_unit'))
    check('forecastUrl carries no place name', !forecastUrl(london).includes('London'))
    const forecast = parseForecast(
      {
        current: { temperature_2m: 7.4, weather_code: 3 },
        daily: {
          time: ['2026-11-23', '2026-11-24', '2026-11-25'],
          weather_code: [3, 61, 'x'],
          temperature_2m_max: [9, 8.5, 7],
          temperature_2m_min: [2, 3, 1]
        }
      },
      london,
      janNoon
    )
    check(
      'parseForecast reads current conditions and skips malformed days',
      !!forecast && forecast.temperature === 7.4 && forecast.code === 3 && forecast.days.length === 2 &&
        forecast.days[1].high === 8.5 && forecast.place === 'London' && forecast.fetchedAt === janNoon.toISOString()
    )
    check('parseForecast rejects an unexpected reply', parseForecast({ error: true }, london, janNoon) === null && parseForecast(null, london, janNoon) === null)
    const places = parsePlaces({
      results: [
        { name: 'London', admin1: 'England', country: 'United Kingdom', latitude: 51.5, longitude: -0.12 },
        { name: 'London', country: 'Canada', latitude: 42.98, longitude: -81.23 },
        { name: 'Nowhere', latitude: 'x', longitude: 1 }
      ]
    })
    check('parsePlaces keeps valid places with their region', places.length === 2 && places[0].region === 'England, United Kingdom' && places[1].region === 'Canada')
    check('parsePlaces of no results is empty', parsePlaces({}).length === 0 && parsePlaces('x').length === 0)
    check('getWeather is off by default (no request)', (await getWeather()).status === 'off')

    // Updates
    check('parseVersion reads v-prefixed and pre-release tags', parseVersion('v0.3.0')?.join() === '0,3,0' && parseVersion('1.2.3-beta.1')?.join() === '1,2,3')
    check('parseVersion rejects non-versions', parseVersion('dev') === null && parseVersion('') === null)
    check('isNewerVersion compares numerically', isNewerVersion('0.10.0', '0.9.9') && isNewerVersion('v1.0.0', '0.3.0'))
    check('isNewerVersion: equal or older is not newer', !isNewerVersion('0.3.0', '0.3.0') && !isNewerVersion('v0.2.9', '0.3.0'))
    check('isNewerVersion: unparseable is never newer', !isNewerVersion('dev', '0.1.0') && !isNewerVersion('9.9.9', 'dev'))
    check('updateCheckEnabled: unset or malformed means on', updateCheckEnabled(undefined) && updateCheckEnabled(null) && updateCheckEnabled('x') && updateCheckEnabled({}) && updateCheckEnabled({ latestVersion: '0.3.0' }))
    check('updateCheckEnabled: only an explicit false is off', !updateCheckEnabled({ enabled: false }) && updateCheckEnabled({ enabled: true }) && updateCheckEnabled({ enabled: 'false' }) && updateCheckEnabled({ enabled: 0 }))
    check('launchCheckDue: once, after unlock, while on', launchCheckDue({ unlocked: true, enabled: true, alreadyRan: false }))
    check('launchCheckDue: never twice in one launch', !launchCheckDue({ unlocked: true, enabled: true, alreadyRan: true }))
    check('launchCheckDue: never while locked or switched off', !launchCheckDue({ unlocked: false, enabled: true, alreadyRan: false }) && !launchCheckDue({ unlocked: true, enabled: false, alreadyRan: false }))
    check('update status: a fresh database reports the check as on', getPreferences().updates === undefined && updateStatus().enabled)
    const rel = parseLatestRelease({ tag_name: 'v0.4.0', html_url: `${UPDATE_RELEASES_URL}/tag/v0.4.0` })
    check('parseLatestRelease reads the tag and keeps the project URL', rel?.version === '0.4.0' && rel?.url === `${UPDATE_RELEASES_URL}/tag/v0.4.0`)
    check('parseLatestRelease rejects a foreign URL', parseLatestRelease({ tag_name: 'v9.0.0', html_url: 'https://evil.example/kaseki' })?.url === UPDATE_RELEASES_URL)
    check('parseLatestRelease rejects a look-alike host', parseLatestRelease({ tag_name: 'v9.0.0', html_url: 'https://github.com.evil.example/yanderebait/kaseki/releases/x' })?.url === UPDATE_RELEASES_URL)
    check('parseLatestRelease rejects a path that escapes the project', parseLatestRelease({ tag_name: 'v9.0.0', html_url: `${UPDATE_RELEASES_URL}/../../../other/repo` })?.url === UPDATE_RELEASES_URL)
    check('parseLatestRelease needs a tag', parseLatestRelease({ html_url: UPDATE_RELEASES_URL }) === null && parseLatestRelease('x') === null)
    // Switched off explicitly first, so the suite never reaches the network.
    const off = setUpdateCheckEnabled(false)
    check('switching the check off is stored as an explicit false', !off.enabled && (getPreferences().updates as { enabled?: unknown }).enabled === false)
    const upd = await checkForUpdate()
    check('checkForUpdate is a no-op while disabled', !upd.enabled && upd.checkedAt === null && upd.latestVersion === null)
    check('update status: nothing is downloading before the user asks', upd.download.state === 'idle' && upd.download.percent === 0)

    // Notifications
    const nowN = new Date('2030-01-15T12:00:00Z')
    const cand = (over: Partial<ReminderCandidate>): ReminderCandidate => ({
      masterId: 1,
      occurrenceStart: '2030-01-15T12:10:00.000Z',
      title: 'Event',
      allDay: false,
      completed: false,
      location: null,
      ...over
    })
    const inWindow = cand({ masterId: 1 })
    const boundary = cand({ masterId: 2, occurrenceStart: '2030-01-15T12:15:00.000Z' })
    const tooEarly = cand({ masterId: 3, occurrenceStart: '2030-01-15T12:20:00.000Z' })
    const started = cand({ masterId: 4, occurrenceStart: '2030-01-15T11:59:00.000Z' })
    const allDayC = cand({ masterId: 5, allDay: true })
    const doneC = cand({ masterId: 6, completed: true })
    const sentC = cand({ masterId: 7 })
    const reminders = dueReminders([inWindow, boundary, tooEarly, started, allDayC, doneC, sentC], nowN, 15, new Set([reminderKey(sentC)]))
    check('dueReminders: within the lead window, including its edge', reminders.map((r) => r.masterId).join() === '1,2')
    check('dueReminders: none with a zero-length window', dueReminders([inWindow], nowN, 5, new Set()).length === 0)
    const notif = { ...DEFAULT_NOTIFICATIONS, enabled: true, digestHour: 9 }
    const before9 = new Date(2030, 0, 15, 8, 30)
    const after9 = new Date(2030, 0, 15, 9, 30)
    check('digestDue: not before the hour', !digestDue(notif, null, before9))
    check('digestDue: due after the hour', digestDue(notif, null, after9))
    check('digestDue: once per day', !digestDue(notif, localDateKey(after9), after9) && digestDue(notif, '2030-01-14', after9))
    check('digestDue: never while off or without the summary', !digestDue(DEFAULT_NOTIFICATIONS, null, after9) && !digestDue({ ...notif, dailyDigest: false }, null, after9))
    check('digestBody: nothing to say is null', digestBody(0, 0) === null)
    check('digestBody: singular and plural', digestBody(1, 0) === '1 task due today' && digestBody(2, 3) === '2 tasks due today, 3 overdue' && digestBody(0, 2) === '2 overdue')

    // Backup (pure)
    check('backupFolderName is local and sortable', backupFolderName(new Date(2026, 10, 23, 17, 45, 2)) === 'Kaseki-backup-2026-11-23-174502')
    check('isBackupFolderName rejects partial and foreign names', isBackupFolderName('Kaseki-backup-2026-11-23-174502') && !isBackupFolderName('Kaseki-backup-2026-11-23-174502.partial') && !isBackupFolderName('Kaseki-backup-notes'))
    const pruneNames = [
      'Kaseki-backup-2026-01-01-000000',
      'Kaseki-backup-2026-01-03-000000',
      'Kaseki-backup-2026-01-02-000000',
      'holiday.jpg',
      'Kaseki-backup-notes',
      'Kaseki-backup-2026-01-01-000000.partial'
    ]
    check('backupsToPrune removes the oldest Kaseki backups only', backupsToPrune(pruneNames, 1).join() === 'Kaseki-backup-2026-01-01-000000,Kaseki-backup-2026-01-02-000000')
    check('backupsToPrune never touches foreign names', backupsToPrune(pruneNames, 0).every((n) => isBackupFolderName(n)) && backupsToPrune(pruneNames, 10).length === 0)
    const nowB = new Date('2026-11-23T12:00:00Z')
    const dailyBackup = { ...DEFAULT_BACKUP, schedule: 'daily' as const, folder: '/backups' }
    check('scheduledBackupDue: never while off or without a folder', !scheduledBackupDue({ ...DEFAULT_BACKUP, folder: '/backups' }, nowB) && !scheduledBackupDue({ ...dailyBackup, folder: '' }, nowB))
    check('scheduledBackupDue: due when never run', scheduledBackupDue(dailyBackup, nowB))
    check('scheduledBackupDue: daily interval', !scheduledBackupDue({ ...dailyBackup, lastAt: '2026-11-23T02:00:00Z' }, nowB) && scheduledBackupDue({ ...dailyBackup, lastAt: '2026-11-22T11:00:00Z' }, nowB))
    check('scheduledBackupDue: weekly interval', !scheduledBackupDue({ ...dailyBackup, schedule: 'weekly', lastAt: '2026-11-20T12:00:00Z' }, nowB) && scheduledBackupDue({ ...dailyBackup, schedule: 'weekly', lastAt: '2026-11-15T12:00:00Z' }, nowB))
    check('isInside: a sibling with a shared prefix is outside', !isInside('/data/kaseki', '/data/kaseki-backups') && isInside('/data/kaseki', '/data/kaseki/uploads') && isInside('/data/kaseki', '/data/kaseki/..x') && !isInside('/data/kaseki', '/data'))

    // Search options
    const so = normalizeSearchOptions(null)
    check('search options default to everything, eight per kind', SEARCH_TYPES.every((t) => so.types[t]) && so.maxPerType === 8)
    const soOff = normalizeSearchOptions({ types: { task: false, file: 'no' }, maxPerType: 3 })
    check('search options honour explicit off only', !soOff.types.task && soOff.types.file && soOff.types.event && soOff.maxPerType === 3)
    check('search options reject a silly cap', normalizeSearchOptions({ maxPerType: 0 }).maxPerType === 8 && normalizeSearchOptions({ maxPerType: 'x' }).maxPerType === 8)
    const noTasks = normalizeSearchOptions({ types: { task: false } })
    const evDefault = globalSearch('evidence', [], defaultSearchOptions())
    const evNoTasks = globalSearch('evidence', [], noTasks)
    check('globalSearch drops a switched-off type', evDefault.some((h) => h.type === 'task') && !evNoTasks.some((h) => h.type === 'task') && evNoTasks.some((h) => h.type === 'file'))

    // CSV round trip
    const csvIn = [
      ['Title', 'Note', 'Minutes'],
      ['Smith, J', 'said "ok"\nthen left', 30],
      ['plain', null, 0]
    ]
    const csvOut = toCsv(csvIn)
    check('toCsv quotes only what needs it and ends rows with CRLF', csvOut.startsWith('Title,Note,Minutes\r\n"Smith, J","said ""ok""\nthen left",30\r\n') && csvOut.endsWith('plain,,0\r\n'))
    check(
      'toCsv / parseCsv round trip',
      JSON.stringify(parseCsv(csvOut)) === JSON.stringify(csvIn.map((r) => r.map((v) => (v == null ? '' : String(v)))))
    )

    // Upcoming (db/upcoming) — a fixed "now" in 2030 keeps the suite's own
    // dated tasks out of the window (they read as overdue, which is fine).
    const nowUp = new Date(2030, 0, 15, 12, 0, 0)
    const countsDay = new Date(2030, 0, 17, 9, 0, 0)
    const countsBefore = dueCounts(countsDay)
    const upSpace = createSpace({ name: 'Upcoming Test', accentColor: '#378ADD' })
    const goneSpace = createSpace({ name: 'Upcoming Archived', accentColor: '#888780' })
    createTask({ spaceId: upSpace.id, title: 'UP overdue', dueDate: '2030-01-10' })
    createTask({ spaceId: upSpace.id, title: 'UP soon', dueDate: '2030-01-17' })
    createTask({ spaceId: upSpace.id, title: 'UP far', dueDate: '2030-02-20' })
    createTask({ spaceId: upSpace.id, title: 'UP done', dueDate: '2030-01-16', status: 'Done' })
    const upArchived = createTask({ spaceId: upSpace.id, title: 'UP archived', dueDate: '2030-01-16' })
    updateTask(upArchived.id, { archived: true })
    createTask({ spaceId: goneSpace.id, title: 'UP hidden', dueDate: '2030-01-16' })
    createEvent({ spaceId: goneSpace.id, title: 'UP hidden event', start: new Date(2030, 0, 16, 10).toISOString() })
    archiveSpace(goneSpace.id, true)
    createEvent({ spaceId: upSpace.id, title: 'UP meeting', start: new Date(2030, 0, 16, 10).toISOString(), end: new Date(2030, 0, 16, 11).toISOString() })
    const doneStart = new Date(2030, 0, 16, 11).toISOString()
    const doneEvent = createEvent({ spaceId: upSpace.id, title: 'UP completed', start: doneStart })
    setOccurrenceCompleted(doneEvent.id, doneStart, true)
    createEvent({ spaceId: upSpace.id, title: 'UP next month', start: new Date(2030, 1, 20, 10).toISOString() })
    const upItems = listUpcoming(nowUp, 7, 500)
    const upTitles = upItems.map((i) => i.title)
    check('listUpcoming includes overdue and soon-due tasks and events', ['UP overdue', 'UP soon', 'UP meeting'].every((t) => upTitles.includes(t)))
    check('listUpcoming excludes Done and archived tasks', !upTitles.includes('UP done') && !upTitles.includes('UP archived'))
    check('listUpcoming excludes an archived space’s tasks and events', !upTitles.includes('UP hidden') && !upTitles.includes('UP hidden event'))
    check('listUpcoming excludes completed events', !upTitles.includes('UP completed'))
    check('listUpcoming respects the window', !upTitles.includes('UP far') && !upTitles.includes('UP next month'))
    const firstNotOverdue = upItems.findIndex((i) => !i.overdue)
    check(
      'listUpcoming puts overdue first',
      upItems[0].overdue && upItems.slice(firstNotOverdue).every((i) => !i.overdue) &&
        upItems.find((i) => i.title === 'UP overdue')?.overdue === true
    )
    check('listUpcoming is chronological after that', upTitles.indexOf('UP meeting') < upTitles.indexOf('UP soon'))
    check('listUpcoming respects the limit', listUpcoming(nowUp, 7, 2).length === 2)
    check('listUpcoming carries the space', upItems.find((i) => i.title === 'UP meeting')?.spaceName === 'Upcoming Test')
    // maxPerType, on a query with several task hits (the UP tasks above).
    const upDefault = globalSearch('UP ', [], defaultSearchOptions())
    const upOne = globalSearch('UP ', [], { ...defaultSearchOptions(), maxPerType: 1 })
    check(
      'globalSearch honours maxPerType',
      upDefault.filter((h) => h.type === 'task').length > 1 &&
        SEARCH_TYPES.every((t) => upOne.filter((h) => h.type === t).length <= 1) &&
        upOne.some((h) => h.type === 'task')
    )
    const countsAfter = dueCounts(countsDay)
    check(
      'dueCounts counts due-today and overdue with the same exclusions',
      countsAfter.dueToday === countsBefore.dueToday + 1 && countsAfter.overdue === countsBefore.overdue + 1
    )

    // Task export (dataExport)
    const exportTask = createTask({ spaceId: upSpace.id, title: 'Export "quoted", with comma', description: 'line one\nline two' })
    const exported = parseCsv(buildTasksCsv())
    const taskTotal = (getDb().prepare('SELECT count(*) AS n FROM tasks t JOIN spaces s ON s.id = t.space_id').get() as { n: number }).n
    check('buildTasksCsv has the header and one row per task', exported[0].join() === TASK_EXPORT_HEADER.join() && exported.length === taskTotal + 1)
    const exportedRow = exported.find((r) => r[1] === exportTask.title)
    check('buildTasksCsv round-trips quotes, commas, and newlines', !!exportedRow && exportedRow[0] === 'Upcoming Test' && exportedRow[2] === 'line one\nline two')
    check('buildTasksCsv marks archived spaces and tasks', exported.some((r) => r[1] === 'UP hidden' && r[9] === 'yes') && exported.some((r) => r[1] === 'UP archived' && r[8] === 'yes'))

    // Backup (files): to a sibling of the data folder, never inside it.
    const backupRoot = `${paths.root}-backups`
    mkdirSync(backupRoot, { recursive: true })
    const made = createBackup(backupRoot, new Date(2026, 0, 2, 3, 4, 5))
    check('createBackup writes a timestamped folder', made.ok && made.path === join(backupRoot, 'Kaseki-backup-2026-01-02-030405') && existsSync(made.path ?? ''))
    const manifest = readManifest(made.path ?? '')
    check('createBackup writes a manifest', manifest?.app === 'kaseki' && manifest.files === made.files && (made.files ?? 0) > 0 && (made.bytes ?? 0) > 0)
    check('the backup holds the encrypted database and content folders', isRestorable(made.path ?? '') && ['uploads', 'sensitive', 'backgrounds', 'icons'].every((d) => existsSync(join(made.path ?? '', d))))
    check('the backup leaves logs out', !existsSync(join(made.path ?? '', 'logs')))
    check('createBackup refuses a destination inside the data folder', !createBackup(paths.uploads, new Date(2026, 0, 2, 3, 4, 7)).ok && !createBackup(paths.root, new Date(2026, 0, 2, 3, 4, 8)).ok)
    check('createBackup refuses a missing folder', !createBackup(join(backupRoot, 'missing'), new Date(2026, 0, 2, 3, 4, 9)).ok)
    check('createBackup refuses to overwrite an existing backup', !createBackup(backupRoot, new Date(2026, 0, 2, 3, 4, 5)).ok)
    const pruneRoot = join(backupRoot, 'prune-test')
    for (const name of pruneNames) mkdirSync(join(pruneRoot, name), { recursive: true })
    const prunedCount = pruneBackups(pruneRoot, 2)
    const left = readdirSync(pruneRoot).sort()
    check(
      'pruneBackups keeps the newest and leaves foreign entries alone',
      prunedCount === 1 && !left.includes('Kaseki-backup-2026-01-01-000000') &&
        ['Kaseki-backup-2026-01-02-000000', 'Kaseki-backup-2026-01-03-000000', 'holiday.jpg', 'Kaseki-backup-notes', 'Kaseki-backup-2026-01-01-000000.partial'].every((n) => left.includes(n))
    )

    // The login password can finally rotate: rekey re-encrypts in place, a
    // wrong current password is refused, and the new password unlocks after
    // a close. (Rotated back so the final teardown checks still apply.)
    check('rekey refuses a wrong current password', rekeyDatabase('not-the-password', 'x') === false)
    check('rekey succeeds with the right password', rekeyDatabase('self-test-password', 'rotated-password') === true)
    closeDatabase()
    check('the old password no longer unlocks after rekey', !unlockDatabase('self-test-password'))
    check('the new password unlocks after rekey', unlockDatabase('rotated-password'))
    check('rekey back for teardown', rekeyDatabase('rotated-password', 'self-test-password') === true)

    // Legal documents + onboarding (Part 13). The bundled text parses into the
    // three expected documents, both versions of each survive verbatim, and the
    // acceptance / first-run state machine behaves.
    check('bundles exactly three legal documents', LEGAL_DOCUMENTS.length === 3)
    check(
      'documents are titled and ordered as expected',
      LEGAL_DOCUMENTS.map((d) => d.title).join(' | ') === LEGAL_TITLES.join(' | ')
    )
    check(
      'every document has both a human and a legal version',
      LEGAL_DOCUMENTS.every((d) => d.human.length > 0 && d.legal.length > 0)
    )
    const [terms, , aup] = LEGAL_DOCUMENTS
    check(
      'Terms recital keeps the "Common Plebeian" line verbatim',
      terms.legal.includes('Common Plebeian of the Masses')
    )
    check(
      'AUP keeps the Samaritans 116 123 number verbatim in both versions',
      aup.human.includes('Samaritans') &&
        aup.human.includes('116 123') &&
        aup.legal.includes('116 123')
    )
    check('legal version is a 16-char fingerprint', /^[0-9a-f]{16}$/.test(LEGAL_VERSION))

    check('a fresh database needs onboarding', !getPreferences().onboardedAt)
    check(
      'the current legal version is not yet accepted',
      legalAcceptanceStatus().accepted === false && legalAcceptanceStatus().version === LEGAL_VERSION
    )
    recordLegalAcceptance()
    check('acceptance is recorded for the current version', legalAcceptanceStatus().accepted === true)

    // First-run ordering (0.3.1): the legal modal is dealt with alone; the tour
    // and the settings tip wait for acceptance, including while the status
    // check is still in flight (the 0.1.0–0.3.0 bug: tour + legal together).
    check(
      'legal gate: no answer yet is checking, then required or accepted',
      legalGate(null) === 'checking' &&
        legalGate({ accepted: false }) === 'required' &&
        legalGate({ accepted: true }) === 'accepted'
    )
    const fresh = { onboarding: false, tourRequested: true, justOnboarded: true }
    const checking = firstRunOverlays({ ...fresh, legal: 'checking' })
    check(
      'first run: nothing opens while the legal status is still being checked',
      !checking.legalModal && !checking.startTour && !checking.showTip
    )
    const pending = firstRunOverlays({ ...fresh, legal: 'required' })
    check(
      'first run: the legal modal shows alone, with no tour or tip',
      pending.legalModal && !pending.startTour && !pending.showTip
    )
    const accepted = firstRunOverlays({ ...fresh, legal: 'accepted' })
    check(
      'first run: the tour and tip follow acceptance, the modal is gone',
      !accepted.legalModal && accepted.startTour && accepted.showTip
    )
    const during = firstRunOverlays({ ...fresh, onboarding: true, legal: 'required' })
    check('first run: nothing overlays onboarding itself', !during.legalModal && !during.startTour && !during.showTip)
    const returning = firstRunOverlays({
      onboarding: false,
      legal: 'required',
      tourRequested: false,
      justOnboarded: false
    })
    check(
      'returning user with changed legal text: modal only, no tour or tip',
      returning.legalModal && !returning.startTour && !returning.showTip
    )
    const declined = firstRunOverlays({ ...fresh, tourRequested: false, legal: 'accepted' })
    check('first run: declining the tour still gets the tip', !declined.startTour && declined.showTip)
    check(
      'an open tour stays hidden until legal is accepted',
      !tourVisible(true, 'checking') && !tourVisible(true, 'required') && tourVisible(true, 'accepted') &&
        !tourVisible(false, 'accepted')
    )
    const avail = { enabled: true, updateAvailable: true }
    const settled = { legal: 'accepted' as const, tourPending: false, tourOpen: false, dismissed: false, update: avail }
    check('update prompt: shows once everything first-run is settled', updatePromptVisible(settled))
    check(
      'update prompt: never over the legal modal or while its status is unknown',
      !updatePromptVisible({ ...settled, legal: 'required' }) && !updatePromptVisible({ ...settled, legal: 'checking' })
    )
    check(
      'update prompt: waits for the guided tour, including one about to open',
      !updatePromptVisible({ ...settled, tourOpen: true }) && !updatePromptVisible({ ...settled, tourPending: true })
    )
    check('update prompt: Later hides it', !updatePromptVisible({ ...settled, dismissed: true }))
    check(
      'update prompt: nothing to show without a newer version, an answer, or with the check off',
      !updatePromptVisible({ ...settled, update: { enabled: true, updateAvailable: false } }) &&
        !updatePromptVisible({ ...settled, update: null }) &&
        !updatePromptVisible({ ...settled, update: { enabled: false, updateAvailable: true } })
    )
    // Models migration 005's backfill: a populated users table (a returning
    // user) gets stamped, so they are never pushed back through onboarding.
    getDb().exec(
      "UPDATE users SET preferences = json_set(COALESCE(preferences, '{}'), '$.onboardedAt', CURRENT_TIMESTAMP) WHERE json_extract(COALESCE(preferences, '{}'), '$.onboardedAt') IS NULL"
    )
    check('the onboarded backfill stamps an existing user', !!getPreferences().onboardedAt)

    closeDatabase()
    check('close locks', getAuthStatus() === 'locked')
    lockedStartupChecks('with a locked database', check)

    const header = readFileSync(paths.database).subarray(0, 15).toString('utf8')
    check('file is encrypted at rest', header !== 'SQLite format 3')

    check('wrong password rejected', !unlockDatabase('wrong-password'))
    check('still locked after rejection', getAuthStatus() === 'locked')

    check('correct password unlocks', unlockDatabase('self-test-password'))
    check('unlocked after unlock', getAuthStatus() === 'unlocked')

    // Restore (backup.restoreInto): back up, change something, close, restore,
    // reopen — the change is gone and the replaced data sits in restore-undo.
    lockVault()
    const finalBackup = createBackup(`${paths.root}-backups`, new Date(2026, 0, 2, 3, 4, 6))
    check('a final backup before restore', finalBackup.ok)
    setPreferences({ restoreMarker: 'after-backup' })
    closeDatabase()
    let undoDir = ''
    try {
      undoDir = restoreInto(paths.root, finalBackup.path ?? '', new Date(2026, 0, 2, 3, 5, 0))
    } catch (error) {
      process.stderr.write(`restoreInto threw: ${String(error)}\n`)
    }
    check('restoreInto keeps an undo copy of the replaced data', !!undoDir && existsSync(join(undoDir, 'kaseki.db')))
    check('the restored database unlocks', unlockDatabase('self-test-password'))
    check('the restore brought back the earlier state', getPreferences().restoreMarker === undefined)
    closeDatabase()
    let refusedInside = false
    try {
      restoreInto(paths.root, undoDir)
    } catch {
      refusedInside = true
    }
    check('restoreInto refuses a backup inside the data folder', refusedInside && existsSync(join(undoDir, 'kaseki.db')))

    closeDatabase()
  } catch (error) {
    process.stderr.write(`self-test threw: ${String(error)}\n`)
    return 1
  }

  return failures.length === 0 ? 0 : 1
}
