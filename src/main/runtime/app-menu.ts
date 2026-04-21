import { app, dialog, Menu } from 'electron'
import { deleteFrames } from '../workspace-entities'
import { pages, selectedPageId } from './runtime-context'
import { workspaceViewMode } from '../ui-state'
import { selectBrowserTab } from './runtime-core'
import { checkForUpdatesManually } from '../auto-updater'
import { showOnboardingWindow } from '../onboarding-window'
import { showDebugWindow } from '../debug-window'
import {
  bundledSkillHash,
  installedSkillHash,
  type SkillId,
} from '../skill-install'

const SKILL_IDS: SkillId[] = ['telescope', 'agent-browser']

function pendingSkillUpdates(): number {
  let count = 0
  for (const id of SKILL_IDS) {
    const installed = installedSkillHash(id)
    const bundled = bundledSkillHash(id)
    if (installed !== null && bundled !== null && installed !== bundled) {
      count++
    }
  }
  return count
}

function setupLabel(): string {
  const pending = pendingSkillUpdates()
  if (pending === 0) return 'Setup Telescope\u2026'
  if (pending === 1) return 'Setup Telescope\u2026 (1 update)'
  return `Setup Telescope\u2026 (${pending} updates)`
}

function buildTemplate(): Electron.MenuItemConstructorOptions[] {
  const isMac = process.platform === 'darwin'

  return [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              {
                label: 'About Telescope',
                click: showAboutDialog,
              },
              {
                label: 'Check for Updates\u2026',
                click: () => checkForUpdatesManually(),
              },
              { type: 'separator' as const },
              {
                label: setupLabel(),
                click: () => {
                  void showOnboardingWindow('settings')
                },
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),

    // File
    {
      label: 'File',
      submenu: [
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            const frameId = selectedPageId()
            if (!frameId) return

            const isBrowser = workspaceViewMode() === 'browser'
            let nextTabId: string | null = null

            if (isBrowser) {
              const idx = pages.findIndex((p) => p.id === frameId)
              const next = pages[idx + 1] ?? pages[idx - 1] ?? null
              nextTabId = next?.id ?? null
            }

            deleteFrames({ frameIds: [frameId] })

            if (isBrowser && nextTabId) {
              selectBrowserTab(nextTabId)
            }
          },
        },
      ],
    },

    // Edit — use built-in roles so macOS wires Cut/Copy/Paste/SelectAll into
    // the first-responder chain. Without these roles, Chromium's native
    // clipboard behavior in focused inputs/textareas/contenteditable does not
    // fire reliably on macOS. Canvas entity copy/cut/paste is handled via
    // `copy`/`cut`/`paste` DOM events in the renderer — those events fire
    // regardless of whether the role or a keydown triggered the clipboard.
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },

    // View — skip reload/zoom since the app manages those
    {
      label: 'View',
      submenu: [
        { role: 'toggleDevTools' },
        {
          label: 'Open Motion Debug Window',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => showDebugWindow(),
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },

    // Window
    { role: 'windowMenu' },

    // Help
    {
      role: 'help',
      submenu: [
        // On non-mac, put About and Updates in Help menu
        ...(!isMac
          ? [
              {
                label: 'About Telescope',
                click: showAboutDialog,
              },
              {
                label: 'Check for Updates\u2026',
                click: () => checkForUpdatesManually(),
              },
            ]
          : []),
      ],
    },
  ]
}

export function setupAppMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildTemplate()))
}

/** Rebuild the application menu in place. Use after install/dismiss to
 * refresh the "(N updates)" suffix on the Setup item. */
export function refreshAppMenu(): void {
  setupAppMenu()
}

function showAboutDialog(): void {
  dialog.showMessageBox({
    type: 'info',
    title: 'About Telescope',
    message: 'Telescope',
    detail: [
      `Version ${app.getVersion()}`,
      '',
      'A spatial canvas for agent collaboration on the web.',
      '',
      '\u00A9 2026 Lyle Klyne',
      'Licensed under PolyForm Shield 1.0.0',
    ].join('\n'),
  })
}
