import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import {
  connectProject,
  deleteProject,
  relocateProject,
  renameProject,
  canvasFolderFor,
  onSpaceChange,
} from '../runtime/space-manager'
import {
  getProject,
  listProjects,
  setProjectUrl,
  bumpProjectLastActive,
} from '../runtime/dev-server-manager'
import type { ConnectedProject } from '../../shared/types'
import { setActiveProjectId } from '../runtime/sidebar-state'
import { notifyLeftSidebarData } from '../runtime/sidebar-builder'
import { markDirty } from '../runtime/layout-dirty'
import { requestLayout } from '../runtime/viewport-control'
import { createWorkspaceTab } from '../runtime/workspace-tab-operations'

export function registerProjectIpc(): void {
  ipcMain.handle('project-list', async (): Promise<ConnectedProject[]> => listProjects())

  ipcMain.handle(
    'project-connect-via-picker',
    async (event): Promise<ConnectedProject | null> => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const result = win
        ? await dialog.showOpenDialog(win, {
            title: 'Connect project folder',
            properties: ['openDirectory'],
          })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (result.canceled || result.filePaths.length === 0) return null
      const project = connectProject({ absolutePath: result.filePaths[0] })
      setActiveProjectId(project.id)
      bumpProjectLastActive(project.id)
      createWorkspaceTab('Untitled', project.id)
      return project
    },
  )

  ipcMain.handle(
    'project-rename',
    async (_event, payload: { id?: string; label?: string }): Promise<ConnectedProject | null> => {
      if (!payload?.id || !payload.label) return null
      return renameProject(payload.id, payload.label)
    },
  )

  ipcMain.handle(
    'project-relink',
    async (event, payload: { id?: string }): Promise<ConnectedProject | null> => {
      if (!payload?.id) return null
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const result = win
        ? await dialog.showOpenDialog(win, {
            title: 'Locate project folder',
            properties: ['openDirectory'],
          })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (result.canceled || result.filePaths.length === 0) return null
      return relocateProject(payload.id, result.filePaths[0])
    },
  )

  ipcMain.handle(
    'project-set-url',
    async (_event, payload: { id?: string; url?: string | null }): Promise<void> => {
      if (!payload?.id) return
      setProjectUrl(payload.id, payload.url ?? null)
    },
  )

  ipcMain.handle(
    'project-delete',
    async (event, payload: { id?: string; skipConfirm?: boolean }): Promise<boolean> => {
      if (!payload?.id) return false
      const project = getProject(payload.id)
      if (!project) return false

      if (!payload.skipConfirm) {
        const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
        const detail = `Telescope will delete the project's canvases inside the space folder. Your codebase folder at ${project.absolutePath} will not be modified.`
        const result = win
          ? await dialog.showMessageBox(win, {
              type: 'warning',
              title: `Delete ${project.label}?`,
              message: `Delete ${project.label}?`,
              detail,
              buttons: ['Cancel', 'Delete'],
              defaultId: 0,
              cancelId: 0,
            })
          : await dialog.showMessageBox({
              type: 'warning',
              title: `Delete ${project.label}?`,
              message: `Delete ${project.label}?`,
              detail,
              buttons: ['Cancel', 'Delete'],
              defaultId: 0,
              cancelId: 0,
            })
        if (result.response !== 1) return false
      }

      await deleteProject(payload.id)
      return true
    },
  )

  ipcMain.handle(
    'project-reveal-folder',
    async (_event, payload: { id?: string }): Promise<void> => {
      if (!payload?.id) return
      try {
        await shell.openPath(canvasFolderFor(payload.id))
      } catch {
        // ignore
      }
    },
  )

  ipcMain.handle(
    'project-reveal-codebase',
    async (_event, payload: { id?: string }): Promise<void> => {
      if (!payload?.id) return
      const project = getProject(payload.id)
      if (!project) return
      try {
        await shell.openPath(project.absolutePath)
      } catch {
        // ignore
      }
    },
  )

  ipcMain.handle(
    'project-create-canvas',
    async (_event, payload: { projectId?: string }): Promise<string | null> => {
      if (!payload?.projectId) return null
      if (payload.projectId !== 'scratchpad') {
        setActiveProjectId(payload.projectId)
        bumpProjectLastActive(payload.projectId)
      }
      const projectId = payload.projectId === 'scratchpad' ? undefined : payload.projectId
      createWorkspaceTab('Untitled', projectId)
      return 'Untitled'
    },
  )

  ipcMain.handle(
    'project-set-active',
    async (_event, payload: { id?: string }): Promise<void> => {
      if (!payload?.id) return
      setActiveProjectId(payload.id)
      bumpProjectLastActive(payload.id)
      markDirty('canvas')
      requestLayout()
    },
  )

  // Space-manager events (file watcher, project lifecycle) → re-broadcast sidebar.
  onSpaceChange(() => {
    markDirty('canvas')
    requestLayout()
    notifyLeftSidebarData()
  })
}
