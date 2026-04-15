import { join } from 'path'
import type { WebContents } from 'electron'

/**
 * Load a named renderer entry into a view/window.
 * In dev, uses the Forge Vite dev server URL; in production, loads the built HTML file.
 */
export function loadRenderer(view: { webContents: WebContents }, name: string): void {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    view.webContents.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/src/renderer/${name}/index.html`)
  } else {
    view.webContents.loadFile(
      join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/${name}/index.html`),
    )
  }
}

/** Resolve a preload script path. Forge places preloads alongside main in .vite/build/. */
export function preloadPath(name: string): string {
  return join(__dirname, `${name}.js`)
}
