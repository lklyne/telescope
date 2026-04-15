import { updateElectronApp, UpdateSourceType } from 'update-electron-app'
import { app, autoUpdater, dialog } from 'electron'

/**
 * Initialize auto-update checking.
 * Uses update.electronjs.org (free GitHub release-backed feed).
 * In dev mode, updates are skipped silently.
 */
export function initAutoUpdater(): void {
  if (!app.isPackaged) return

  updateElectronApp({
    updateSource: {
      type: UpdateSourceType.ElectronPublicUpdateService,
      repo: 'lklyne/telescope',
    },
    updateInterval: '10 minutes',
  })

  autoUpdater.on('update-downloaded', (_event, _releaseNotes, releaseName) => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: `Telescope ${releaseName} has been downloaded. Restart to apply the update.`,
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
  })
}

/** Manually check for updates and show a dialog with the result. */
export async function checkForUpdatesManually(): Promise<void> {
  if (!app.isPackaged) {
    dialog.showMessageBox({
      type: 'info',
      title: 'Updates',
      message: 'Update checking is not available in development mode.',
    })
    return
  }

  autoUpdater.once('update-not-available', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'No Updates',
      message: `Telescope ${app.getVersion()} is the latest version.`,
    })
  })

  autoUpdater.checkForUpdates()
}
