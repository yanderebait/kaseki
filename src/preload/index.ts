import { contextBridge, ipcRenderer } from 'electron'
import type {
  ActivityEntry,
  Annotation,
  Bundle,
  BundleDetail,
  CalendarEvent,
  EventOccurrence,
  FileRecord,
  KnowledgeContent,
  KnowledgePage,
  KnowledgePageNode,
  KnowledgeSearchHit,
  LauncherItem,
  LinkCandidates,
  LinkEdge,
  LinkItemType,
  NewAnnotation,
  NewEvent,
  NewKnowledgePage,
  DependencyResult,
  NewSpace,
  NewTask,
  NewTimeEntry,
  Preferences,
  SearchHit,
  SpaceBilling,
  Space,
  SpaceDetail,
  SpaceEdit,
  Subtask,
  Tag,
  Task,
  TaskDetail,
  TaskPatch,
  TaskSummary,
  TaskTemplate,
  TimeEntry,
  TimeEntryPatch,
  TimeReportOptions,
  TimeReportRow,
  User,
  VaultFile,
  VaultStatus
} from '../shared/types'
import type { LegalStatus } from '../shared/legal'
import type { UpcomingItem, WeatherPlace, WeatherResult } from '../shared/widgets'
import type { UpdateStatus } from '../shared/updates'
import type { BackupConfig, BackupResult, BackupSchedule } from '../shared/backup'

type AuthStatus = 'setup' | 'locked' | 'unlocked'
interface AuthResult {
  ok: boolean
  error?: string
}
interface LaunchResult {
  ok: boolean
  error?: string
}

// The single surface the renderer can reach. Everything Kaseki's UI needs
// from the OS or database is added here explicitly — never a raw ipcRenderer.
const api = {
  ping: (): Promise<{ version: string; platform: string }> => ipcRenderer.invoke('app:ping'),
  auth: {
    status: (): Promise<AuthStatus> => ipcRenderer.invoke('auth:status'),
    setup: (name: string, password: string): Promise<AuthResult> =>
      ipcRenderer.invoke('auth:setup', name, password),
    unlock: (password: string): Promise<AuthResult> => ipcRenderer.invoke('auth:unlock', password),
    changePassword: (current: string, next: string): Promise<AuthResult> =>
      ipcRenderer.invoke('auth:changePassword', current, next)
  },
  user: {
    get: (): Promise<User> => ipcRenderer.invoke('user:get')
  },
  prefs: {
    get: (): Promise<Preferences> => ipcRenderer.invoke('prefs:get'),
    set: (patch: Preferences): Promise<Preferences> => ipcRenderer.invoke('prefs:set', patch)
  },
  onboarding: {
    status: (): Promise<{ needed: boolean }> => ipcRenderer.invoke('onboarding:status'),
    complete: (): Promise<{ needed: boolean }> => ipcRenderer.invoke('onboarding:complete')
  },
  legal: {
    status: (): Promise<LegalStatus> => ipcRenderer.invoke('legal:status'),
    accept: (): Promise<LegalStatus> => ipcRenderer.invoke('legal:accept')
  },
  spaces: {
    list: (): Promise<Space[]> => ipcRenderer.invoke('spaces:list'),
    get: (id: number): Promise<SpaceDetail> => ipcRenderer.invoke('spaces:get', id),
    create: (input: NewSpace): Promise<Space> => ipcRenderer.invoke('spaces:create', input),
    update: (id: number, patch: SpaceEdit): Promise<void> =>
      ipcRenderer.invoke('spaces:update', id, patch),
    archive: (id: number, archived: boolean): Promise<void> =>
      ipcRenderer.invoke('spaces:archive', id, archived),
    listArchived: (): Promise<Space[]> => ipcRenderer.invoke('spaces:listArchived'),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('spaces:delete', id),
    setBilling: (spaceId: number, billing: SpaceBilling): Promise<void> =>
      ipcRenderer.invoke('spaces:setBilling', spaceId, billing)
  },
  activity: {
    list: (): Promise<ActivityEntry[]> => ipcRenderer.invoke('activity:list')
  },
  launcher: {
    list: (spaceId: number): Promise<LauncherItem[]> => ipcRenderer.invoke('launcher:list', spaceId),
    launch: (id: number): Promise<LaunchResult> => ipcRenderer.invoke('launcher:launch', id),
    addApp: (spaceId: number): Promise<LauncherItem | null> =>
      ipcRenderer.invoke('launcher:addApp', spaceId),
    addUrl: (spaceId: number, input: { name: string; url: string }): Promise<LauncherItem> =>
      ipcRenderer.invoke('launcher:addUrl', spaceId, input),
    rename: (id: number, name: string): Promise<LauncherItem | null> =>
      ipcRenderer.invoke('launcher:rename', id, name),
    setIcon: (id: number): Promise<LauncherItem | null> =>
      ipcRenderer.invoke('launcher:setIcon', id),
    remove: (id: number): Promise<void> => ipcRenderer.invoke('launcher:remove', id),
    move: (id: number, dir: -1 | 1): Promise<void> => ipcRenderer.invoke('launcher:move', id, dir)
  },
  files: {
    pick: (): Promise<FileRecord | null> => ipcRenderer.invoke('files:pick'),
    list: (): Promise<FileRecord[]> => ipcRenderer.invoke('files:list'),
    get: (id: number): Promise<FileRecord | null> => ipcRenderer.invoke('files:get', id),
    print: (id: number): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('files:print', id),
    exportAnnotated: (id: number): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('files:exportAnnotated', id),
    saveCopy: (id: number): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('files:saveCopy', id),
    reveal: (id: number): Promise<void> => ipcRenderer.invoke('files:reveal', id),
    rename: (id: number, name: string): Promise<void> => ipcRenderer.invoke('files:rename', id, name),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('files:delete', id)
  },
  annotations: {
    list: (fileId: number): Promise<Annotation[]> => ipcRenderer.invoke('annotations:list', fileId),
    create: (input: NewAnnotation): Promise<Annotation> =>
      ipcRenderer.invoke('annotations:create', input),
    update: (id: number, patch: { content?: string; color?: string }): Promise<void> =>
      ipcRenderer.invoke('annotations:update', id, patch),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('annotations:delete', id)
  },
  bundles: {
    list: (): Promise<Bundle[]> => ipcRenderer.invoke('bundles:list'),
    get: (id: number): Promise<BundleDetail | null> => ipcRenderer.invoke('bundles:get', id),
    create: (name: string): Promise<Bundle> => ipcRenderer.invoke('bundles:create', name),
    rename: (id: number, name: string): Promise<void> =>
      ipcRenderer.invoke('bundles:rename', id, name),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('bundles:delete', id),
    addFile: (bundleId: number, fileId: number): Promise<void> =>
      ipcRenderer.invoke('bundles:addFile', bundleId, fileId),
    removeFile: (bundleId: number, fileId: number): Promise<void> =>
      ipcRenderer.invoke('bundles:removeFile', bundleId, fileId),
    move: (bundleId: number, fileId: number, dir: -1 | 1): Promise<void> =>
      ipcRenderer.invoke('bundles:move', bundleId, fileId, dir),
    exportPdf: (id: number): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('bundles:exportPdf', id),
    print: (id: number): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('bundles:print', id)
  },
  events: {
    occurrences: (start: string, end: string, spaceId?: number): Promise<EventOccurrence[]> =>
      ipcRenderer.invoke('events:occurrences', start, end, spaceId),
    get: (id: number): Promise<CalendarEvent | null> => ipcRenderer.invoke('events:get', id),
    create: (input: NewEvent): Promise<CalendarEvent> => ipcRenderer.invoke('events:create', input),
    update: (id: number, patch: NewEvent): Promise<void> =>
      ipcRenderer.invoke('events:update', id, patch),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('events:delete', id),
    setOverride: (masterId: number, originalStart: string, values: NewEvent): Promise<void> =>
      ipcRenderer.invoke('events:setOverride', masterId, originalStart, values),
    cancelOccurrence: (masterId: number, originalStart: string): Promise<void> =>
      ipcRenderer.invoke('events:cancelOccurrence', masterId, originalStart),
    splitSeries: (masterId: number, fromOriginalStart: string, values: NewEvent): Promise<void> =>
      ipcRenderer.invoke('events:splitSeries', masterId, fromOriginalStart, values),
    truncateSeries: (masterId: number, fromOriginalStart: string): Promise<void> =>
      ipcRenderer.invoke('events:truncateSeries', masterId, fromOriginalStart),
    exportIcs: (spaceId?: number | null): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('events:exportIcs', spaceId ?? null),
    setCompleted: (masterId: number, originalStart: string, completed: boolean): Promise<void> =>
      ipcRenderer.invoke('events:setCompleted', masterId, originalStart, completed)
  },
  knowledge: {
    tree: (): Promise<KnowledgePageNode[]> => ipcRenderer.invoke('knowledge:tree'),
    get: (id: number): Promise<KnowledgePage | null> => ipcRenderer.invoke('knowledge:get', id),
    create: (input: NewKnowledgePage): Promise<KnowledgePage> =>
      ipcRenderer.invoke('knowledge:create', input),
    update: (
      id: number,
      patch: { title?: string; content?: KnowledgeContent | null }
    ): Promise<void> => ipcRenderer.invoke('knowledge:update', id, patch),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('knowledge:delete', id),
    reorder: (id: number, dir: -1 | 1): Promise<void> =>
      ipcRenderer.invoke('knowledge:reorder', id, dir),
    move: (id: number, parentId: number | null): Promise<boolean> =>
      ipcRenderer.invoke('knowledge:move', id, parentId),
    search: (query: string): Promise<KnowledgeSearchHit[]> =>
      ipcRenderer.invoke('knowledge:search', query),
    exportMarkdown: (id: number): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('knowledge:exportMarkdown', id)
  },
  links: {
    outgoing: (type: LinkItemType, id: number): Promise<LinkEdge[]> =>
      ipcRenderer.invoke('links:outgoing', type, id),
    backlinks: (type: LinkItemType, id: number): Promise<LinkEdge[]> =>
      ipcRenderer.invoke('links:backlinks', type, id),
    create: (
      sourceType: LinkItemType,
      sourceId: number,
      targetType: LinkItemType,
      targetId: number
    ): Promise<LinkEdge> =>
      ipcRenderer.invoke('links:create', sourceType, sourceId, targetType, targetId),
    delete: (linkId: number): Promise<void> => ipcRenderer.invoke('links:delete', linkId),
    candidates: (): Promise<LinkCandidates> => ipcRenderer.invoke('links:candidates')
  },
  tasks: {
    list: (spaceId: number): Promise<TaskSummary[]> => ipcRenderer.invoke('tasks:list', spaceId),
    listArchived: (spaceId: number): Promise<TaskSummary[]> =>
      ipcRenderer.invoke('tasks:listArchived', spaceId),
    search: (spaceId: number, query: string): Promise<TaskSummary[]> =>
      ipcRenderer.invoke('tasks:search', spaceId, query),
    get: (id: number): Promise<TaskDetail | null> => ipcRenderer.invoke('tasks:get', id),
    create: (input: NewTask): Promise<Task> => ipcRenderer.invoke('tasks:create', input),
    update: (id: number, patch: TaskPatch): Promise<void> =>
      ipcRenderer.invoke('tasks:update', id, patch),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('tasks:delete', id),
    move: (id: number, spaceId: number): Promise<void> =>
      ipcRenderer.invoke('tasks:move', id, spaceId),
    attachFiles: (taskId: number): Promise<FileRecord[]> =>
      ipcRenderer.invoke('tasks:attachFiles', taskId),
    addSubtask: (taskId: number, title: string): Promise<Subtask> =>
      ipcRenderer.invoke('tasks:addSubtask', taskId, title),
    updateSubtask: (id: number, patch: { title?: string; completed?: boolean }): Promise<void> =>
      ipcRenderer.invoke('tasks:updateSubtask', id, patch),
    deleteSubtask: (id: number): Promise<void> => ipcRenderer.invoke('tasks:deleteSubtask', id),
    reorderSubtask: (id: number, dir: -1 | 1): Promise<void> =>
      ipcRenderer.invoke('tasks:reorderSubtask', id, dir),
    tags: (spaceId: number): Promise<Tag[]> => ipcRenderer.invoke('tasks:tags', spaceId),
    createTag: (spaceId: number, name: string, color?: string | null): Promise<Tag> =>
      ipcRenderer.invoke('tasks:createTag', spaceId, name, color ?? null),
    addTag: (taskId: number, tagId: number): Promise<void> =>
      ipcRenderer.invoke('tasks:addTag', taskId, tagId),
    removeTag: (taskId: number, tagId: number): Promise<void> =>
      ipcRenderer.invoke('tasks:removeTag', taskId, tagId),
    setField: (taskId: number, fieldId: number, value: string | null): Promise<void> =>
      ipcRenderer.invoke('tasks:setField', taskId, fieldId, value),
    addDependency: (upstreamId: number, downstreamId: number): Promise<DependencyResult> =>
      ipcRenderer.invoke('tasks:addDependency', upstreamId, downstreamId),
    removeDependency: (upstreamId: number, downstreamId: number): Promise<void> =>
      ipcRenderer.invoke('tasks:removeDependency', upstreamId, downstreamId),
    incompleteBlockers: (id: number): Promise<number> =>
      ipcRenderer.invoke('tasks:incompleteBlockers', id),
    saveNote: (id: number, content: KnowledgeContent | null): Promise<void> =>
      ipcRenderer.invoke('tasks:saveNote', id, content),
    detachFile: (taskId: number, fileId: number): Promise<void> =>
      ipcRenderer.invoke('tasks:detachFile', taskId, fileId),
    templates: (spaceId: number): Promise<TaskTemplate[]> =>
      ipcRenderer.invoke('tasks:templates', spaceId),
    createTemplate: (taskId: number, name: string): Promise<TaskTemplate> =>
      ipcRenderer.invoke('tasks:createTemplate', taskId, name),
    applyTemplate: (templateId: number): Promise<Task> =>
      ipcRenderer.invoke('tasks:applyTemplate', templateId),
    deleteTemplate: (id: number): Promise<void> => ipcRenderer.invoke('tasks:deleteTemplate', id),
    addTime: (input: NewTimeEntry): Promise<TimeEntry> => ipcRenderer.invoke('tasks:addTime', input),
    listTime: (taskId: number): Promise<TimeEntry[]> => ipcRenderer.invoke('tasks:listTime', taskId),
    updateTime: (id: number, patch: TimeEntryPatch): Promise<void> =>
      ipcRenderer.invoke('tasks:updateTime', id, patch),
    deleteTime: (id: number): Promise<void> => ipcRenderer.invoke('tasks:deleteTime', id),
    timeReport: (opts: TimeReportOptions): Promise<TimeReportRow[]> =>
      ipcRenderer.invoke('tasks:timeReport', opts)
  },
  reports: {
    exportCsv: (name: string, csv: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('reports:exportCsv', name, csv)
  },
  search: {
    query: (query: string): Promise<SearchHit[]> => ipcRenderer.invoke('search:query', query)
  },
  // v0.3.0 — the home-screen widgets and the settings pages that were
  // placeholders until now.
  widgets: {
    upcoming: (): Promise<UpcomingItem[]> => ipcRenderer.invoke('widgets:upcoming')
  },
  weather: {
    get: (force = false): Promise<WeatherResult> => ipcRenderer.invoke('weather:get', force),
    search: (query: string): Promise<WeatherPlace[]> => ipcRenderer.invoke('weather:search', query)
  },
  updates: {
    status: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:status'),
    setEnabled: (enabled: boolean): Promise<UpdateStatus> =>
      ipcRenderer.invoke('updates:setEnabled', enabled),
    check: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:check'),
    // "Update now": starts the in-app download (packaged Windows builds only);
    // progress arrives through onChanged.
    download: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:download'),
    // "Restart to update": quits and runs the verified installer.
    install: (): Promise<void> => ipcRenderer.invoke('updates:install'),
    // Fires when a check finishes, the toggle changes, or download progress
    // moves. Returns an unsubscribe function.
    onChanged: (callback: (status: UpdateStatus) => void): (() => void) => {
      const listener = (_event: unknown, status: UpdateStatus): void => callback(status)
      ipcRenderer.on('updates:changed', listener)
      return () => ipcRenderer.removeListener('updates:changed', listener)
    }
  },
  backup: {
    config: (): Promise<BackupConfig> => ipcRenderer.invoke('backup:config'),
    now: (): Promise<BackupResult> => ipcRenderer.invoke('backup:now'),
    chooseFolder: (): Promise<BackupConfig> => ipcRenderer.invoke('backup:chooseFolder'),
    update: (patch: { schedule?: BackupSchedule; keep?: number }): Promise<BackupConfig> =>
      ipcRenderer.invoke('backup:update', patch),
    restore: (): Promise<BackupResult> => ipcRenderer.invoke('backup:restore')
  },
  dataExport: {
    tasksCsv: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('export:tasksCsv')
  },
  notifications: {
    test: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('notifications:test')
  },
  crash: {
    report: (payload: { name?: string; message?: string; stack?: string }): Promise<void> =>
      ipcRenderer.invoke('crash:report', payload),
    sample: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('crash:sample')
  },
  vault: {
    status: (): Promise<VaultStatus> => ipcRenderer.invoke('vault:status'),
    create: (passcode: string): Promise<{ mnemonic: string }> =>
      ipcRenderer.invoke('vault:create', passcode),
    unlock: (passcode: string): Promise<boolean> => ipcRenderer.invoke('vault:unlock', passcode),
    lock: (): Promise<void> => ipcRenderer.invoke('vault:lock'),
    changePasscode: (oldPasscode: string, newPasscode: string): Promise<boolean> =>
      ipcRenderer.invoke('vault:changePasscode', oldPasscode, newPasscode),
    resetWithRecovery: (mnemonic: string, newPasscode: string): Promise<boolean> =>
      ipcRenderer.invoke('vault:resetWithRecovery', mnemonic, newPasscode),
    list: (): Promise<VaultFile[]> => ipcRenderer.invoke('vault:list'),
    addFiles: (): Promise<VaultFile[]> => ipcRenderer.invoke('vault:addFiles'),
    get: (id: number): Promise<VaultFile | null> => ipcRenderer.invoke('vault:get', id),
    rename: (id: number, name: string): Promise<void> =>
      ipcRenderer.invoke('vault:rename', id, name),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('vault:delete', id),
    scheduleClipboardClear: (): Promise<boolean> =>
      ipcRenderer.invoke('vault:scheduleClipboardClear'),
    // Fires whenever the vault locks or unlocks in the main process —
    // including the inactivity auto-lock, which the renderer previously had
    // no way to observe. Returns an unsubscribe function.
    onChanged: (callback: (status: VaultStatus) => void): (() => void) => {
      const listener = (_event: unknown, status: VaultStatus): void => callback(status)
      ipcRenderer.on('vault:changed', listener)
      return () => ipcRenderer.removeListener('vault:changed', listener)
    }
  }
}

export type KasekiApi = typeof api

contextBridge.exposeInMainWorld('kaseki', api)
