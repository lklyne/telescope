/**
 * Centralized crash/error logger.
 *
 * Writes structured lines to `~/Library/Logs/Telescope/errors.log` (or the
 * platform equivalent under `app.getPath('logs')`) and mirrors them to
 * stdout so `pnpm dev` shows the same record. Used for:
 *
 *   - main-process uncaughtException / unhandledRejection
 *   - render-process-gone / child-process-gone
 *   - renderer console errors + warnings forwarded over the
 *     `console-message` channel (see wireRendererLogging)
 *   - render-side window.onerror / unhandledrejection (forwarded as
 *     console.error from the renderer entry points)
 *
 * One file, one format. Keeps debugging dead-easy for in-the-field crashes
 * where DevTools isn't an option.
 */

import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { WebContents } from 'electron'

let errorLogPath: string | null = null

function ensureErrorLogPath(): string {
  if (errorLogPath) return errorLogPath
  const logsDir = app.getPath('logs')
  try { mkdirSync(logsDir, { recursive: true }) } catch {}
  errorLogPath = join(logsDir, 'errors.log')
  return errorLogPath
}

function formatDetail(detail: unknown): string {
  if (detail instanceof Error) return detail.stack ?? detail.message
  if (typeof detail === 'string') return detail
  try { return JSON.stringify(detail) } catch { return String(detail) }
}

export function logCrash(kind: string, detail: unknown): void {
  const line = `[${new Date().toISOString()}] ${kind}\n${formatDetail(detail)}\n\n`
  try { appendFileSync(ensureErrorLogPath(), line) } catch {}
  console.error(kind, detail)
}

/** Forward renderer console.error / console.warn into the crash log. */
export function wireRendererLogging(wc: WebContents, label: string): void {
  // 'console-message' fires for every console.* call from the renderer. We
  // only care about error and warning levels — info/debug would be noise.
  wc.on('console-message', (event) => {
    const { level, message, sourceId, lineNumber } = event
    // Electron 27+ uses string levels ('error', 'warning', etc).
    if (level !== 'error' && level !== 'warning') return
    const where = sourceId ? `${sourceId}:${lineNumber}` : '<renderer>'
    logCrash(
      `renderer:${label}:${level}`,
      `${message}\n  at ${where}`,
    )
  })

  wc.on('render-process-gone', (_event, details) => {
    logCrash(`render-process-gone:${label}`, {
      url: safeUrl(wc),
      ...details,
    })
  })

  wc.on('unresponsive', () => {
    logCrash(`renderer-unresponsive:${label}`, { url: safeUrl(wc) })
  })

  wc.on('preload-error', (_event, preloadPath, error) => {
    logCrash(`preload-error:${label}`, { preloadPath, error })
  })
}

function safeUrl(wc: WebContents): string {
  try { return wc.getURL() } catch { return '<destroyed>' }
}
