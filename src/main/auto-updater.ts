import { autoUpdater } from 'electron-updater'
import { app, dialog } from 'electron'

/**
 * Initialize auto-update checking.
 * Uses electron-updater with GitHub Releases as the update feed.
 * In dev mode, updates are skipped silently.
 */
export function initAutoUpdater(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: `Telescope ${info.version} has been downloaded. Restart to apply the update.`,
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
  })

  autoUpdater.on('error', (err) => {
    console.error('Auto-update error:', err.message)
  })

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('Failed to check for updates:', err.message)
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

  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result || !result.updateInfo || result.updateInfo.version === app.getVersion()) {
      dialog.showMessageBox({
        type: 'info',
        title: 'No Updates',
        message: `Telescope ${app.getVersion()} is the latest version.`,
      })
    }
    // If an update is found, the 'update-downloaded' handler will show the restart dialog.
  } catch (err) {
    dialog.showMessageBox({
      type: 'error',
      title: 'Update Check Failed',
      message: `Could not check for updates: ${err instanceof Error ? err.message : String(err)}`,
    })
  }
}
