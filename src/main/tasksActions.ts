import { BrowserWindow, dialog } from 'electron'
import { ingestFile } from './db/files'
import { linkFile, listTaskFiles } from './db/tasks'
import type { FileRecord } from '../shared/types'

// "Attach files" on a task: a native multi-select dialog, each file ingested
// into the content-addressed store and linked to the task. Returns the task's
// updated file list.
export async function attachFilesToTask(taskId: number): Promise<FileRecord[]> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const options: Electron.OpenDialogOptions = {
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Documents',
        extensions: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'md', 'markdown', 'csv', 'txt', 'log', 'json']
      },
      { name: 'All files', extensions: ['*'] }
    ]
  }
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled) return listTaskFiles(taskId)
  for (const path of result.filePaths) {
    linkFile(taskId, ingestFile(path).id)
  }
  return listTaskFiles(taskId)
}
