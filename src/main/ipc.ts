import { ipcMain } from 'electron'
import { appVersion } from './version'
import {
  createDatabase,
  getAuthStatus,
  getUser,
  unlockDatabase,
  type AuthStatus,
  type User
} from './db/connection'
import { getPreferences, setPreferences, type Preferences } from './db/prefs'
import { createSpace, getSpaceDetail, listSpaces, setSpaceBilling } from './db/spaces'
import { listActivity } from './db/activity'
import {
  createUrlItem,
  getLauncherItem,
  listLauncherItems,
  moveItem,
  removeItem,
  renameItem
} from './db/launcher'
import { addAppViaDialog, launchItem, setIconViaDialog, type LaunchResult } from './launcherActions'
import { getFile, listFiles } from './db/files'
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotations,
  updateAnnotation
} from './db/annotations'
import {
  addFileToBundle,
  createBundle,
  deleteBundle,
  getBundle,
  listBundles,
  moveBundleFile,
  removeFileFromBundle,
  renameBundle
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
  getTaskDetail,
  incompleteBlockerCount,
  listSpaceTags,
  listTasks,
  listTemplates,
  listTimeEntries,
  moveTask,
  removeDependency,
  removeTag,
  reorderSubtask,
  saveNote,
  searchTasks,
  setFieldValue,
  timeReport,
  unlinkFile,
  updateSubtask,
  updateTask,
  updateTimeEntry
} from './db/tasks'
import { exportPageMarkdown } from './knowledgeActions'
import {
  changePasscode,
  createVault,
  deleteVaultFile,
  getVaultFile,
  listVaultFiles,
  lock as lockVault,
  renameVaultFile,
  resetWithRecovery,
  unlock as unlockVault,
  vaultStatus
} from './vault/store'
import { addFilesViaDialog, scheduleClipboardClear } from './vaultActions'
import { attachFilesToTask } from './tasksActions'
import { exportReportCsv } from './reportsActions'
import { reportError, sampleEvent } from './crashReport'
import { legalAcceptanceStatus, recordLegalAcceptance } from './legal'
import { pickAndIngest, revealFile, saveCopy } from './filesActions'
import { saveIcs } from './calendarActions'
import { printBundle, printFile, type PrintResult } from './printActions'
import { exportAnnotatedCopy, exportBundlePdf } from './exportActions'
import {
  FIELD_TYPES,
  type ActivityEntry,
  type Annotation,
  type AnnotationType,
  type Bundle,
  type BundleDetail,
  type CalendarEvent,
  type EventOccurrence,
  type FieldDef,
  type FieldType,
  type FileRecord,
  type KnowledgeContent,
  type KnowledgePage,
  type KnowledgePageNode,
  type KnowledgeSearchHit,
  type LauncherItem,
  type LinkCandidates,
  type LinkEdge,
  type LinkItemType,
  type NewAnnotation,
  type NewEvent,
  type DependencyResult,
  type NewTask,
  type NewTimeEntry,
  type SearchHit,
  type SpaceBilling,
  type Space,
  type SpaceDetail,
  type Subtask,
  type Tag,
  type Task,
  type TaskDetail,
  type TaskPatch,
  type TaskSummary,
  type TaskTemplate,
  type TimeEntry,
  type TimeEntryPatch,
  type TimeReportRow,
  type VaultFile,
  type VaultStatus
} from '../shared/types'
import type { LegalStatus } from '../shared/legal'
import { log } from './logger'

export interface AuthResult {
  ok: boolean
  error?: string
}

export function registerIpcHandlers(): void {
  ipcMain.handle('app:ping', () => ({
    version: appVersion,
    platform: process.platform
  }))

  ipcMain.handle('auth:status', (): AuthStatus => getAuthStatus())

  ipcMain.handle('auth:setup', (_event, name: unknown, password: unknown): AuthResult => {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return { ok: false, error: 'Name must not be empty.' }
    }
    if (typeof password !== 'string' || password.length === 0) {
      return { ok: false, error: 'Password must not be empty.' }
    }
    try {
      createDatabase(password, name.trim())
      return { ok: true }
    } catch (error) {
      log.error('Database creation failed', error)
      return { ok: false, error: 'Could not create the database. See logs for details.' }
    }
  })

  ipcMain.handle('user:get', (): User => getUser())

  ipcMain.handle('auth:unlock', (_event, password: unknown): AuthResult => {
    if (typeof password !== 'string' || password.length === 0) {
      return { ok: false, error: 'Password must not be empty.' }
    }
    try {
      return unlockDatabase(password)
        ? { ok: true }
        : { ok: false, error: 'Wrong password.' }
    } catch (error) {
      log.error('Unlock failed', error)
      return { ok: false, error: 'Could not open the database. See logs for details.' }
    }
  })

  ipcMain.handle('prefs:get', (): Preferences => getPreferences())

  ipcMain.handle('prefs:set', (_event, patch: unknown): Preferences => {
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
      throw new Error('prefs:set expects an object')
    }
    return setPreferences(patch as Preferences)
  })

  // Onboarding state machine (Part 13 / Phase 8). `needed` is the single
  // source of truth for whether the first-run flow runs; it is true until the
  // flow records completion. Returning users carry an onboardedAt set either
  // by completing onboarding or by migration 005's backfill.
  ipcMain.handle('onboarding:status', (): { needed: boolean } => ({
    needed: !getPreferences().onboardedAt
  }))

  ipcMain.handle('onboarding:complete', (): { needed: boolean } => {
    setPreferences({ onboardedAt: new Date().toISOString() })
    return { needed: false }
  })

  ipcMain.handle('legal:status', (): LegalStatus => legalAcceptanceStatus())

  ipcMain.handle('legal:accept', (): LegalStatus => recordLegalAcceptance())

  ipcMain.handle('spaces:list', (): Space[] => listSpaces())

  ipcMain.handle('spaces:get', (_event, id: unknown): SpaceDetail => {
    if (typeof id !== 'number') throw new Error('spaces:get expects a numeric id')
    return getSpaceDetail(id)
  })

  ipcMain.handle('spaces:create', (_event, input: unknown): Space => {
    if (typeof input !== 'object' || input === null) {
      throw new Error('spaces:create expects an object')
    }
    const obj = input as Record<string, unknown>
    if (typeof obj.name !== 'string' || obj.name.trim().length === 0) {
      throw new Error('Space name is required')
    }
    return createSpace({
      name: obj.name.trim(),
      accentColor: typeof obj.accentColor === 'string' ? obj.accentColor : null,
      icon: typeof obj.icon === 'string' ? obj.icon : null,
      presetId: typeof obj.presetId === 'string' ? obj.presetId : null,
      fields: sanitizeFields(obj.fields),
      statusSet: Array.isArray(obj.statusSet)
        ? obj.statusSet.filter((s): s is string => typeof s === 'string')
        : undefined,
      cheatsheet: typeof obj.cheatsheet === 'string' ? obj.cheatsheet : undefined
    })
  })

  ipcMain.handle('activity:list', (): ActivityEntry[] => listActivity())

  ipcMain.handle('launcher:list', (_event, spaceId: unknown): LauncherItem[] => {
    if (typeof spaceId !== 'number') throw new Error('launcher:list expects a numeric space id')
    return listLauncherItems(spaceId)
  })

  ipcMain.handle('launcher:launch', (_event, id: unknown): Promise<LaunchResult> => {
    if (typeof id !== 'number') throw new Error('launcher:launch expects a numeric id')
    return launchItem(id)
  })

  ipcMain.handle('launcher:addApp', (_event, spaceId: unknown): Promise<LauncherItem | null> => {
    if (typeof spaceId !== 'number') throw new Error('launcher:addApp expects a numeric space id')
    return addAppViaDialog(spaceId)
  })

  ipcMain.handle('launcher:addUrl', (_event, spaceId: unknown, input: unknown): LauncherItem => {
    if (typeof spaceId !== 'number') throw new Error('launcher:addUrl expects a numeric space id')
    if (typeof input !== 'object' || input === null) throw new Error('launcher:addUrl expects an object')
    const { name, url } = input as Record<string, unknown>
    if (typeof name !== 'string' || name.trim().length === 0) throw new Error('Name is required')
    if (typeof url !== 'string' || url.trim().length === 0) throw new Error('URL is required')
    return createUrlItem(spaceId, name.trim(), url)
  })

  ipcMain.handle('launcher:rename', (_event, id: unknown, name: unknown): LauncherItem | null => {
    if (typeof id !== 'number') throw new Error('launcher:rename expects a numeric id')
    if (typeof name !== 'string' || name.trim().length === 0) throw new Error('Name is required')
    renameItem(id, name.trim())
    return getLauncherItem(id)
  })

  ipcMain.handle('launcher:setIcon', (_event, id: unknown): Promise<LauncherItem | null> => {
    if (typeof id !== 'number') throw new Error('launcher:setIcon expects a numeric id')
    return setIconViaDialog(id)
  })

  ipcMain.handle('launcher:remove', (_event, id: unknown): void => {
    if (typeof id !== 'number') throw new Error('launcher:remove expects a numeric id')
    removeItem(id)
  })

  ipcMain.handle('launcher:move', (_event, id: unknown, dir: unknown): void => {
    if (typeof id !== 'number') throw new Error('launcher:move expects a numeric id')
    moveItem(id, dir === -1 ? -1 : 1)
  })

  ipcMain.handle('files:pick', (): Promise<FileRecord | null> => pickAndIngest())

  ipcMain.handle('files:list', (): FileRecord[] => listFiles())

  ipcMain.handle('files:get', (_event, id: unknown): FileRecord | null => {
    if (typeof id !== 'number') throw new Error('files:get expects a numeric id')
    return getFile(id)
  })

  ipcMain.handle('files:print', (_event, id: unknown): Promise<PrintResult> => {
    if (typeof id !== 'number') throw new Error('files:print expects a numeric id')
    return printFile(id)
  })

  ipcMain.handle('files:saveCopy', (_event, id: unknown): Promise<{ ok: boolean; error?: string }> => {
    if (typeof id !== 'number') throw new Error('files:saveCopy expects a numeric id')
    return saveCopy(id)
  })

  ipcMain.handle('files:reveal', (_event, id: unknown): void => {
    if (typeof id !== 'number') throw new Error('files:reveal expects a numeric id')
    revealFile(id)
  })

  ipcMain.handle('annotations:list', (_event, fileId: unknown): Annotation[] => {
    if (typeof fileId !== 'number') throw new Error('annotations:list expects a numeric file id')
    return listAnnotations(fileId)
  })

  ipcMain.handle('annotations:create', (_event, input: unknown): Annotation => {
    if (typeof input !== 'object' || input === null) {
      throw new Error('annotations:create expects an object')
    }
    const o = input as Record<string, unknown>
    if (typeof o.fileId !== 'number') throw new Error('fileId is required')
    if (typeof o.page !== 'number') throw new Error('page is required')
    if (o.type !== 'bookmark' && o.type !== 'highlight' && o.type !== 'note') {
      throw new Error('invalid annotation type')
    }
    const annotation: NewAnnotation = {
      fileId: o.fileId,
      page: o.page,
      type: o.type as AnnotationType,
      position:
        typeof o.position === 'object' && o.position !== null
          ? (o.position as Record<string, number>)
          : null,
      content: typeof o.content === 'string' ? o.content : null,
      color: typeof o.color === 'string' ? o.color : null
    }
    return createAnnotation(annotation)
  })

  ipcMain.handle('annotations:update', (_event, id: unknown, patch: unknown): void => {
    if (typeof id !== 'number') throw new Error('annotations:update expects a numeric id')
    const p = (typeof patch === 'object' && patch !== null ? patch : {}) as Record<string, unknown>
    updateAnnotation(id, {
      content: typeof p.content === 'string' ? p.content : undefined,
      color: typeof p.color === 'string' ? p.color : undefined
    })
  })

  ipcMain.handle('annotations:delete', (_event, id: unknown): void => {
    if (typeof id !== 'number') throw new Error('annotations:delete expects a numeric id')
    deleteAnnotation(id)
  })

  ipcMain.handle(
    'files:exportAnnotated',
    (_event, id: unknown): Promise<{ ok: boolean; error?: string }> => {
      if (typeof id !== 'number') throw new Error('files:exportAnnotated expects a numeric id')
      return exportAnnotatedCopy(id)
    }
  )

  ipcMain.handle('bundles:list', (): Bundle[] => listBundles())

  ipcMain.handle('bundles:get', (_event, id: unknown): BundleDetail | null => {
    if (typeof id !== 'number') throw new Error('bundles:get expects a numeric id')
    return getBundle(id)
  })

  ipcMain.handle('bundles:create', (_event, name: unknown): Bundle => {
    if (typeof name !== 'string' || name.trim().length === 0) throw new Error('Bundle name required')
    return createBundle(name.trim())
  })

  ipcMain.handle('bundles:rename', (_event, id: unknown, name: unknown): void => {
    if (typeof id !== 'number') throw new Error('bundles:rename expects a numeric id')
    if (typeof name !== 'string' || name.trim().length === 0) throw new Error('Name required')
    renameBundle(id, name.trim())
  })

  ipcMain.handle('bundles:delete', (_event, id: unknown): void => {
    if (typeof id !== 'number') throw new Error('bundles:delete expects a numeric id')
    deleteBundle(id)
  })

  ipcMain.handle('bundles:addFile', (_event, bundleId: unknown, fileId: unknown): void => {
    if (typeof bundleId !== 'number' || typeof fileId !== 'number') {
      throw new Error('bundles:addFile expects numeric ids')
    }
    addFileToBundle(bundleId, fileId)
  })

  ipcMain.handle('bundles:removeFile', (_event, bundleId: unknown, fileId: unknown): void => {
    if (typeof bundleId !== 'number' || typeof fileId !== 'number') {
      throw new Error('bundles:removeFile expects numeric ids')
    }
    removeFileFromBundle(bundleId, fileId)
  })

  ipcMain.handle('bundles:move', (_event, bundleId: unknown, fileId: unknown, dir: unknown): void => {
    if (typeof bundleId !== 'number' || typeof fileId !== 'number') {
      throw new Error('bundles:move expects numeric ids')
    }
    moveBundleFile(bundleId, fileId, dir === -1 ? -1 : 1)
  })

  ipcMain.handle(
    'bundles:exportPdf',
    (_event, id: unknown): Promise<{ ok: boolean; error?: string }> => {
      if (typeof id !== 'number') throw new Error('bundles:exportPdf expects a numeric id')
      return exportBundlePdf(id)
    }
  )

  ipcMain.handle('bundles:print', (_event, id: unknown): Promise<PrintResult> => {
    if (typeof id !== 'number') throw new Error('bundles:print expects a numeric id')
    return printBundle(id)
  })

  ipcMain.handle(
    'events:occurrences',
    (_event, start: unknown, end: unknown, spaceId: unknown): EventOccurrence[] => {
      if (typeof start !== 'string' || typeof end !== 'string') {
        throw new Error('events:occurrences expects ISO range strings')
      }
      return expandEvents(start, end, typeof spaceId === 'number' ? spaceId : undefined)
    }
  )

  ipcMain.handle('events:get', (_event, id: unknown): CalendarEvent | null => {
    if (typeof id !== 'number') throw new Error('events:get expects a numeric id')
    return getEvent(id)
  })

  ipcMain.handle('events:create', (_event, input: unknown): CalendarEvent =>
    createEvent(sanitizeEvent(input))
  )

  ipcMain.handle('events:update', (_event, id: unknown, patch: unknown): void => {
    if (typeof id !== 'number') throw new Error('events:update expects a numeric id')
    updateEvent(id, sanitizeEvent(patch))
  })

  ipcMain.handle('events:delete', (_event, id: unknown): void => {
    if (typeof id !== 'number') throw new Error('events:delete expects a numeric id')
    deleteEvent(id)
  })

  ipcMain.handle('events:setOverride', (_event, masterId: unknown, original: unknown, values: unknown): void => {
    if (typeof masterId !== 'number' || typeof original !== 'string') {
      throw new Error('events:setOverride expects (id, originalStart, values)')
    }
    setOverride(masterId, original, sanitizeEvent(values))
  })

  ipcMain.handle('events:cancelOccurrence', (_event, masterId: unknown, original: unknown): void => {
    if (typeof masterId !== 'number' || typeof original !== 'string') {
      throw new Error('events:cancelOccurrence expects (id, originalStart)')
    }
    cancelOccurrence(masterId, original)
  })

  ipcMain.handle('events:splitSeries', (_event, masterId: unknown, from: unknown, values: unknown): void => {
    if (typeof masterId !== 'number' || typeof from !== 'string') {
      throw new Error('events:splitSeries expects (id, fromOriginalStart, values)')
    }
    splitSeries(masterId, from, sanitizeEvent(values))
  })

  ipcMain.handle('events:truncateSeries', (_event, masterId: unknown, from: unknown): void => {
    if (typeof masterId !== 'number' || typeof from !== 'string') {
      throw new Error('events:truncateSeries expects (id, fromOriginalStart)')
    }
    truncateSeries(masterId, from)
  })

  ipcMain.handle('events:exportIcs', (_event, spaceId: unknown): Promise<{ ok: boolean }> => {
    if (spaceId != null && typeof spaceId !== 'number') {
      throw new Error('events:exportIcs expects an optional numeric spaceId')
    }
    return saveIcs(spaceId ?? null)
  })

  ipcMain.handle(
    'events:setCompleted',
    (_event, masterId: unknown, original: unknown, completed: unknown): void => {
      if (typeof masterId !== 'number' || typeof original !== 'string') {
        throw new Error('events:setCompleted expects (id, originalStart, completed)')
      }
      setOccurrenceCompleted(masterId, original, completed === true)
    }
  )

  ipcMain.handle('knowledge:tree', (): KnowledgePageNode[] => listTree())

  ipcMain.handle('knowledge:get', (_event, id: unknown): KnowledgePage | null => {
    if (typeof id !== 'number') throw new Error('knowledge:get expects a numeric id')
    return getPage(id)
  })

  ipcMain.handle('knowledge:create', (_event, input: unknown): KnowledgePage => {
    if (typeof input !== 'object' || input === null) {
      throw new Error('knowledge:create expects an object')
    }
    const o = input as Record<string, unknown>
    if (typeof o.title !== 'string' || o.title.trim().length === 0) {
      throw new Error('Page title is required')
    }
    return createPage({
      title: o.title.trim(),
      parentId: typeof o.parentId === 'number' ? o.parentId : null,
      content: sanitizeContent(o.content)
    })
  })

  ipcMain.handle('knowledge:update', (_event, id: unknown, patch: unknown): void => {
    if (typeof id !== 'number') throw new Error('knowledge:update expects a numeric id')
    const p = (typeof patch === 'object' && patch !== null ? patch : {}) as Record<string, unknown>
    updatePage(id, {
      title: typeof p.title === 'string' && p.title.trim().length > 0 ? p.title.trim() : undefined,
      content: 'content' in p ? sanitizeContent(p.content) : undefined
    })
  })

  ipcMain.handle('knowledge:delete', (_event, id: unknown): void => {
    if (typeof id !== 'number') throw new Error('knowledge:delete expects a numeric id')
    deletePage(id)
  })

  ipcMain.handle('knowledge:reorder', (_event, id: unknown, dir: unknown): void => {
    if (typeof id !== 'number') throw new Error('knowledge:reorder expects a numeric id')
    reorderPage(id, dir === -1 ? -1 : 1)
  })

  ipcMain.handle('knowledge:move', (_event, id: unknown, parentId: unknown): boolean => {
    if (typeof id !== 'number') throw new Error('knowledge:move expects a numeric id')
    if (parentId !== null && typeof parentId !== 'number') {
      throw new Error('knowledge:move expects a numeric or null parentId')
    }
    return movePage(id, parentId)
  })

  ipcMain.handle('knowledge:search', (_event, query: unknown): KnowledgeSearchHit[] => {
    if (typeof query !== 'string') throw new Error('knowledge:search expects a string')
    return searchPages(query)
  })

  ipcMain.handle('knowledge:exportMarkdown', (_event, id: unknown): Promise<{ ok: boolean }> => {
    if (typeof id !== 'number') throw new Error('knowledge:exportMarkdown expects a numeric id')
    return exportPageMarkdown(id)
  })

  ipcMain.handle('links:outgoing', (_event, type: unknown, id: unknown): LinkEdge[] => {
    if (typeof id !== 'number') throw new Error('links:outgoing expects a numeric id')
    return listOutgoing(asLinkType(type), id)
  })

  ipcMain.handle('links:backlinks', (_event, type: unknown, id: unknown): LinkEdge[] => {
    if (typeof id !== 'number') throw new Error('links:backlinks expects a numeric id')
    return listBacklinks(asLinkType(type), id)
  })

  ipcMain.handle(
    'links:create',
    (_event, sourceType: unknown, sourceId: unknown, targetType: unknown, targetId: unknown): LinkEdge => {
      if (typeof sourceId !== 'number' || typeof targetId !== 'number') {
        throw new Error('links:create expects numeric ids')
      }
      return createLink(asLinkType(sourceType), sourceId, asLinkType(targetType), targetId)
    }
  )

  ipcMain.handle('links:delete', (_event, linkId: unknown): void => {
    if (typeof linkId !== 'number') throw new Error('links:delete expects a numeric id')
    deleteLink(linkId)
  })

  ipcMain.handle('links:candidates', (): LinkCandidates => linkCandidates())

  ipcMain.handle('tasks:list', (_event, spaceId: unknown): TaskSummary[] =>
    listTasks(Number(spaceId))
  )
  ipcMain.handle('tasks:search', (_event, spaceId: unknown, query: unknown): TaskSummary[] =>
    searchTasks(Number(spaceId), String(query ?? ''))
  )
  ipcMain.handle('tasks:get', (_event, id: unknown): TaskDetail | null =>
    getTaskDetail(Number(id))
  )
  ipcMain.handle('tasks:create', (_event, input: unknown): Task => {
    const t = input as NewTask
    if (!t || typeof t.spaceId !== 'number' || typeof t.title !== 'string' || t.title.trim() === '') {
      throw new Error('tasks:create requires a spaceId and a non-empty title')
    }
    return createTask({ ...t, title: t.title.trim() })
  })
  ipcMain.handle('tasks:update', (_event, id: unknown, patch: unknown): void =>
    updateTask(Number(id), (patch ?? {}) as TaskPatch)
  )
  ipcMain.handle('tasks:delete', (_event, id: unknown): void => deleteTask(Number(id)))
  ipcMain.handle('tasks:move', (_event, id: unknown, spaceId: unknown): void =>
    moveTask(Number(id), Number(spaceId))
  )

  ipcMain.handle('tasks:addSubtask', (_event, taskId: unknown, title: unknown): Subtask =>
    addSubtask(Number(taskId), String(title ?? '').trim())
  )
  ipcMain.handle(
    'tasks:updateSubtask',
    (_event, id: unknown, patch: unknown): void =>
      updateSubtask(Number(id), (patch ?? {}) as { title?: string; completed?: boolean })
  )
  ipcMain.handle('tasks:deleteSubtask', (_event, id: unknown): void => deleteSubtask(Number(id)))
  ipcMain.handle('tasks:reorderSubtask', (_event, id: unknown, dir: unknown): void =>
    reorderSubtask(Number(id), dir === -1 ? -1 : 1)
  )

  ipcMain.handle('tasks:tags', (_event, spaceId: unknown): Tag[] => listSpaceTags(Number(spaceId)))
  ipcMain.handle('tasks:createTag', (_event, spaceId: unknown, name: unknown, color: unknown): Tag =>
    createTag(Number(spaceId), String(name ?? ''), typeof color === 'string' ? color : null)
  )
  ipcMain.handle('tasks:addTag', (_event, taskId: unknown, tagId: unknown): void =>
    addTag(Number(taskId), Number(tagId))
  )
  ipcMain.handle('tasks:removeTag', (_event, taskId: unknown, tagId: unknown): void =>
    removeTag(Number(taskId), Number(tagId))
  )
  ipcMain.handle('tasks:setField', (_event, taskId: unknown, fieldId: unknown, value: unknown): void =>
    setFieldValue(Number(taskId), Number(fieldId), value === null ? null : String(value))
  )

  ipcMain.handle('tasks:addDependency', (_event, up: unknown, down: unknown): DependencyResult =>
    addDependency(Number(up), Number(down))
  )
  ipcMain.handle('tasks:removeDependency', (_event, up: unknown, down: unknown): void =>
    removeDependency(Number(up), Number(down))
  )
  ipcMain.handle('tasks:incompleteBlockers', (_event, id: unknown): number =>
    incompleteBlockerCount(Number(id))
  )
  ipcMain.handle('tasks:saveNote', (_event, id: unknown, content: unknown): void =>
    saveNote(Number(id), (content ?? null) as KnowledgeContent | null)
  )
  ipcMain.handle('tasks:detachFile', (_event, taskId: unknown, fileId: unknown): void =>
    unlinkFile(Number(taskId), Number(fileId))
  )
  ipcMain.handle('tasks:templates', (_event, spaceId: unknown): TaskTemplate[] =>
    listTemplates(Number(spaceId))
  )
  ipcMain.handle('tasks:createTemplate', (_event, taskId: unknown, name: unknown): TaskTemplate =>
    createTemplate(Number(taskId), String(name ?? '').trim() || 'Template')
  )
  ipcMain.handle('tasks:applyTemplate', (_event, id: unknown): Task => applyTemplate(Number(id)))
  ipcMain.handle('tasks:deleteTemplate', (_event, id: unknown): void => deleteTemplate(Number(id)))
  ipcMain.handle('tasks:attachFiles', (_event, taskId: unknown): Promise<FileRecord[]> =>
    attachFilesToTask(Number(taskId))
  )

  // Time tracking (Part 7, Phase 10b). The timer/pomodoro and manual-entry UI
  // build on these; addTime logs both pomodoro sessions and manual entries.
  ipcMain.handle('tasks:addTime', (_event, input: unknown): TimeEntry => {
    const o = input as NewTimeEntry
    if (!o || typeof o.taskId !== 'number' || typeof o.startAt !== 'string' || typeof o.duration !== 'number') {
      throw new Error('tasks:addTime requires taskId, startAt, and duration')
    }
    return addTimeEntry(o)
  })
  ipcMain.handle('tasks:listTime', (_event, taskId: unknown): TimeEntry[] =>
    listTimeEntries(Number(taskId))
  )
  ipcMain.handle('tasks:updateTime', (_event, id: unknown, patch: unknown): void =>
    updateTimeEntry(Number(id), (patch ?? {}) as TimeEntryPatch)
  )
  ipcMain.handle('tasks:deleteTime', (_event, id: unknown): void => deleteTimeEntry(Number(id)))
  ipcMain.handle('tasks:timeReport', (_event, opts: unknown): TimeReportRow[] => {
    const o = (opts ?? {}) as Record<string, unknown>
    return timeReport({
      spaceId: typeof o.spaceId === 'number' ? o.spaceId : null,
      from: typeof o.from === 'string' ? o.from : null,
      to: typeof o.to === 'string' ? o.to : null
    })
  })

  ipcMain.handle('spaces:setBilling', (_event, spaceId: unknown, billing: unknown): void => {
    if (typeof spaceId !== 'number') throw new Error('spaces:setBilling expects a numeric space id')
    const b = (billing ?? {}) as Record<string, unknown>
    setSpaceBilling(spaceId, {
      mode: b.mode as SpaceBilling['mode'],
      rate: typeof b.rate === 'number' ? b.rate : null
    })
  })

  // Crash reporting (opt-in, Part 14 #12). report() forwards a renderer error;
  // sample() returns the exact (sanitised) payload the Settings preview shows.
  ipcMain.handle('crash:report', (_event, payload: unknown): void => {
    const o = (payload ?? {}) as Record<string, unknown>
    const err = new Error(typeof o.message === 'string' ? o.message : 'Renderer error')
    err.name = typeof o.name === 'string' ? o.name : 'Error'
    if (typeof o.stack === 'string') err.stack = o.stack
    reportError(err, 'renderer')
  })
  ipcMain.handle('crash:sample', (): Record<string, unknown> => sampleEvent())

  ipcMain.handle('reports:exportCsv', (_event, name: unknown, csv: unknown): Promise<{ ok: boolean }> => {
    if (typeof csv !== 'string') throw new Error('reports:exportCsv expects a CSV string')
    return exportReportCsv(typeof name === 'string' && name ? name : 'Kaseki report', csv)
  })

  // Global search (Part 15). Vault files are only included while unlocked, and
  // their names are decrypted here before the aggregator scores them.
  ipcMain.handle('search:query', (_event, query: unknown): SearchHit[] => {
    const q = typeof query === 'string' ? query : ''
    const vaultFiles = vaultStatus() === 'unlocked' ? listVaultFiles() : []
    return globalSearch(q, vaultFiles)
  })

  ipcMain.handle('vault:status', (): VaultStatus => vaultStatus())

  ipcMain.handle('vault:create', (_event, passcode: unknown): { mnemonic: string } => {
    return createVault(requirePasscode(passcode))
  })

  ipcMain.handle('vault:unlock', (_event, passcode: unknown): boolean => {
    if (typeof passcode !== 'string') throw new Error('vault:unlock expects a passcode')
    return unlockVault(passcode)
  })

  ipcMain.handle('vault:lock', (): void => lockVault())

  ipcMain.handle('vault:changePasscode', (_event, oldPasscode: unknown, newPasscode: unknown): boolean => {
    if (typeof oldPasscode !== 'string') throw new Error('vault:changePasscode expects the current passcode')
    return changePasscode(oldPasscode, requirePasscode(newPasscode))
  })

  ipcMain.handle('vault:resetWithRecovery', (_event, mnemonic: unknown, newPasscode: unknown): boolean => {
    if (typeof mnemonic !== 'string') throw new Error('vault:resetWithRecovery expects a recovery phrase')
    return resetWithRecovery(mnemonic, requirePasscode(newPasscode))
  })

  ipcMain.handle('vault:list', (): VaultFile[] => listVaultFiles())

  ipcMain.handle('vault:addFiles', (): Promise<VaultFile[]> => addFilesViaDialog())

  ipcMain.handle('vault:get', (_event, id: unknown): VaultFile | null => {
    if (typeof id !== 'number') throw new Error('vault:get expects a numeric id')
    return getVaultFile(id)
  })

  ipcMain.handle('vault:rename', (_event, id: unknown, name: unknown): void => {
    if (typeof id !== 'number') throw new Error('vault:rename expects a numeric id')
    if (typeof name !== 'string' || name.trim().length === 0) throw new Error('Name is required')
    renameVaultFile(id, name.trim())
  })

  ipcMain.handle('vault:delete', (_event, id: unknown): void => {
    if (typeof id !== 'number') throw new Error('vault:delete expects a numeric id')
    deleteVaultFile(id)
  })

  ipcMain.handle('vault:scheduleClipboardClear', (): boolean => scheduleClipboardClear())
}

// The passcode has no complexity policy (Part 11), but it must be a non-empty
// string — an empty passcode would derive a key from nothing.
function requirePasscode(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('Passcode must not be empty')
  return value
}

const LINK_TYPES: LinkItemType[] = ['knowledge', 'event', 'file']

function asLinkType(value: unknown): LinkItemType {
  if (typeof value !== 'string' || !LINK_TYPES.includes(value as LinkItemType)) {
    throw new Error(`invalid link type: ${String(value)}`)
  }
  return value as LinkItemType
}

// Page content is opaque Tiptap JSON — accept an object (the document) or
// null (an empty page), reject anything else.
function sanitizeContent(value: unknown): KnowledgeContent | null {
  if (value == null) return null
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('page content must be a JSON object or null')
  }
  return value as KnowledgeContent
}

function sanitizeEvent(input: unknown): NewEvent {
  if (typeof input !== 'object' || input === null) throw new Error('event expects an object')
  const o = input as Record<string, unknown>
  if (typeof o.title !== 'string' || o.title.trim().length === 0) throw new Error('Event title is required')
  if (typeof o.start !== 'string') throw new Error('Event start is required')
  return {
    spaceId: typeof o.spaceId === 'number' ? o.spaceId : null,
    title: o.title.trim(),
    description: typeof o.description === 'string' ? o.description : null,
    start: o.start,
    end: typeof o.end === 'string' ? o.end : null,
    allDay: o.allDay === true,
    location: typeof o.location === 'string' ? o.location : null,
    recurrenceRule: typeof o.recurrenceRule === 'string' && o.recurrenceRule.length > 0 ? o.recurrenceRule : null
  }
}

// Validates custom field definitions coming from the renderer (preset data
// or the builder) before they reach the database.
function sanitizeFields(raw: unknown): FieldDef[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) throw new Error('fields must be an array')
  return raw.map((f) => {
    if (typeof f !== 'object' || f === null) throw new Error('invalid field definition')
    const { name, type, options } = f as Record<string, unknown>
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('field name is required')
    }
    if (typeof type !== 'string' || !FIELD_TYPES.includes(type as FieldType)) {
      throw new Error(`invalid field type: ${String(type)}`)
    }
    return {
      name: name.trim(),
      type: type as FieldType,
      options: Array.isArray(options)
        ? options.filter((o): o is string => typeof o === 'string')
        : undefined
    }
  })
}
