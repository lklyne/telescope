import { BrowserWindow, dialog, ipcMain } from 'electron'
import {
  bgView,
  devtoolsHeaderView,
  toolbarView,
} from '../runtime/view-refs'
import {
  connectRepo,
  disconnectRepo,
  findRepoForPath,
  listRepos,
  onChange,
  type ConnectedRepo,
} from '../runtime/dev-server-manager'
import { markDirty } from '../runtime/layout-dirty'
import { requestLayout } from '../runtime/viewport-control'

function broadcastRepos(repos: ConnectedRepo[]): void {
  for (const view of [bgView, devtoolsHeaderView, toolbarView]) {
    try {
      view?.webContents.send('repo-changed', repos)
    } catch {
      // ignore — view may be in the middle of teardown
    }
  }
}

export function registerRepoIpc(): void {
  ipcMain.handle('repo-list', async (): Promise<ConnectedRepo[]> => listRepos())

  ipcMain.handle(
    'repo-connect',
    async (_event, payload: { absolutePath?: string }): Promise<ConnectedRepo | null> => {
      const path = payload?.absolutePath
      if (!path) return null
      return connectRepo(path)
    },
  )

  ipcMain.handle('repo-connect-via-picker', async (event): Promise<ConnectedRepo | null> => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Connect a Vite repo',
          properties: ['openDirectory'],
        })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return connectRepo(result.filePaths[0])
  })

  ipcMain.handle(
    'repo-disconnect',
    async (_event, payload: { id?: string }): Promise<void> => {
      if (payload?.id) await disconnectRepo(payload.id)
    },
  )

  ipcMain.handle(
    'repo-find-for-path',
    async (_event, payload: { absolutePath?: string }): Promise<ConnectedRepo | null> => {
      const path = payload?.absolutePath
      if (!path) return null
      return findRepoForPath(path)
    },
  )

  onChange((repos) => {
    broadcastRepos(repos)
    // Component file entities derive `componentHasRepo` from the current
    // repo set. When that set changes, re-broadcast the canvas scene so
    // the renderer can drop or restore the placeholder for affected
    // entities, and lay out so the new component WCV (if any) gets
    // sized.
    markDirty('canvas')
    requestLayout()
  })
}
