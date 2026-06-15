import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from './paths'
import {
  closeDatabase,
  createDatabase,
  getAuthStatus,
  getDb,
  getUser,
  unlockDatabase
} from './db/connection'
import { getPreferences, setPreferences } from './db/prefs'
import { createSpace, getSpaceDetail, listSpaces, setSpaceBilling } from './db/spaces'
import { listActivity } from './db/activity'
import {
  createUrlItem,
  listLauncherItems,
  moveItem,
  normalizeUrl,
  removeItem
} from './db/launcher'
import { deriveKind, getFile, ingestFile, listFiles } from './db/files'
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
  expandEvents,
  setOccurrenceCompleted,
  setOverride,
  splitSeries,
  truncateSeries
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
import { buildEvent, crashConfig, parseDsn } from './crashReport'
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
import { computeAmount, resolveBilling } from '../shared/billing'
import { PRESETS, getPreset, presetToSpace, searchPresets } from '../shared/presets'
import { LEGAL_DOCUMENTS, LEGAL_VERSION, legalAcceptanceStatus, recordLegalAcceptance } from './legal'
import { LEGAL_TITLES } from '../shared/legal'

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
export async function runSelfTest(): Promise<number> {
  const failures: string[] = []
  const check = (name: string, pass: boolean): void => {
    if (!pass) failures.push(name)
    process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}\n`)
  }

  try {
    check('starts in setup state', getAuthStatus() === 'setup')

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
    check('bare space defaults to universal statuses', bare.statusSet.length === 6 && bare.fields.length === 0)

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
        { id: 8, title: 'Holiday', description: null, start: '2026-07-15T00:00:00.000Z', end: null, allDay: true, location: null, recurrenceRule: null, exdates: [], overrides: [] }
      ],
      'Test',
      '20260101T000000Z'
    )
    check('ics wraps in VCALENDAR', ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.trimEnd().endsWith('END:VCALENDAR'))
    check('ics uses CRLF line breaks', ics.includes('\r\n'))
    check('ics emits the RRULE verbatim', ics.includes('RRULE:FREQ=WEEKLY'))
    check('ics timed DTSTART is absolute UTC', ics.includes('DTSTART:20260713T090000Z'))
    check('ics all-day DTSTART is a floating DATE', ics.includes('DTSTART;VALUE=DATE:'))
    check('ics escapes TEXT special characters', ics.includes('SUMMARY:Stand\\; up') && ics.includes('DESCRIPTION:note\\, line1\\nline2'))
    check('ics emits EXDATE for cancellations', ics.includes('EXDATE:20260720T090000Z'))
    check('ics override carries a RECURRENCE-ID', ics.includes('RECURRENCE-ID:20260727T090000Z'))
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
    const kekPass = deriveKeyFromPasscode('hunter2', saltP)
    const recEntropy = mnemonicToEntropy(generateMnemonic())
    const kekRec = deriveKeyFromEntropy(recEntropy, saltR)
    const wrappedByPass = seal(kekPass, dek)
    const wrappedByRec = seal(kekRec, dek)
    check('dek unwraps via the passcode key', open(kekPass, wrappedByPass).equals(dek))
    check('dek unwraps via the recovery key', open(kekRec, wrappedByRec).equals(dek))
    check('wrong passcode fails to unwrap the dek', tryOpen(deriveKeyFromPasscode('wrong', saltP), wrappedByPass) === null)
    check('derived key is 256-bit', kekPass.length === KEY_BYTES)
    check('scrypt is deterministic for the same passcode and salt', deriveKeyFromPasscode('pw', saltP).equals(deriveKeyFromPasscode('pw', saltP)))
    check('scrypt diverges on a different salt', !deriveKeyFromPasscode('pw', saltP).equals(deriveKeyFromPasscode('pw', saltR)))

    check('generated mnemonic has 24 words', generateMnemonic().split(' ').length === 24)
    check('mnemonic round-trips through entropy', mnemonicToEntropy(entropyToMnemonic(Buffer.alloc(32, 7))).equals(Buffer.alloc(32, 7)))
    const zeroVec = entropyToMnemonic(Buffer.alloc(32, 0))
    check('bip39 known vector: zero entropy → abandon… art', zeroVec.startsWith('abandon abandon') && zeroVec.endsWith(' art'))
    check('mnemonic rejects a bad checksum', !validateMnemonic(`${'abandon '.repeat(23)}abandon`))
    check('mnemonic rejects an unknown word', !validateMnemonic(`${'zzzz '.repeat(23)}art`))

    // Vault store (Part 11) — create, encrypt, lock/unlock, change, recover
    check('vault starts absent', vaultStatus() === 'absent')
    const recovery = createVault('open sesame').mnemonic
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
    check('wrong passcode does not unlock', unlockVault('wrong') === false && vaultStatus() === 'locked')
    check('correct passcode unlocks', unlockVault('open sesame') === true && listVaultFiles()[0].name === 'account.txt')

    check('change passcode succeeds with the old one', changePasscode('open sesame', 'new passphrase') === true)
    lockVault()
    check('old passcode no longer unlocks', unlockVault('open sesame') === false)
    check('new passcode unlocks', unlockVault('new passphrase') === true)

    check('recovery phrase resets the passcode', resetWithRecovery(recovery, 'recovered pass') === true)
    check('a wrong recovery phrase is rejected', resetWithRecovery(generateMnemonic(), 'nope') === false)
    lockVault()
    check('the reset passcode unlocks', unlockVault('recovered pass') === true)
    check('files survive passcode change and recovery', readVaultFile(secret.id)?.bytes.toString() === 'sort code 12-34-56')

    deleteVaultFile(secret.id)
    check('delete removes the file and its blob', listVaultFiles().length === 0)

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
    // Models migration 005's backfill: a populated users table (a returning
    // user) gets stamped, so they are never pushed back through onboarding.
    getDb().exec(
      "UPDATE users SET preferences = json_set(COALESCE(preferences, '{}'), '$.onboardedAt', CURRENT_TIMESTAMP) WHERE json_extract(COALESCE(preferences, '{}'), '$.onboardedAt') IS NULL"
    )
    check('the onboarded backfill stamps an existing user', !!getPreferences().onboardedAt)

    closeDatabase()
    check('close locks', getAuthStatus() === 'locked')

    const header = readFileSync(paths.database).subarray(0, 15).toString('utf8')
    check('file is encrypted at rest', header !== 'SQLite format 3')

    check('wrong password rejected', !unlockDatabase('wrong-password'))
    check('still locked after rejection', getAuthStatus() === 'locked')

    check('correct password unlocks', unlockDatabase('self-test-password'))
    check('unlocked after unlock', getAuthStatus() === 'unlocked')

    closeDatabase()
  } catch (error) {
    process.stderr.write(`self-test threw: ${String(error)}\n`)
    return 1
  }

  return failures.length === 0 ? 0 : 1
}
