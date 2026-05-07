/**
 * Centralized crash/error logger.
 *
 * Writes structured lines to `~/Library/Logs/Specular/errors.log` (or the
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
import { appendFileSync, mkdirSync, statSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { WebContents } from 'electron'

let errorLogPath: string | null = null
// Re-entrancy guard: when stdout/file writes themselves fail (EIO/ENOSPC),
// the resulting throw lands in the uncaughtException handler that calls
// logCrash again. Without this flag we tight-loop and fill disk to TB
// scale in minutes — see the May 2026 incident.
let inFlight = false
// Once writes have started failing with disk-full / IO errors, stop trying
// for the rest of the session. Better to lose log lines than to wedge the
// process or cascade-fill disk.
let disabled = false
const FATAL_FS_CODES = new Set(['ENOSPC', 'EIO', 'EROFS', 'ENOENT'])
const MAX_LOG_BYTES = 50 * 1024 * 1024 // 50 MB hard cap; rotates to .old

function ensureErrorLogPath(): string {
  if (errorLogPath) return errorLogPath
  const logsDir = app.getPath('logs')
  try { mkdirSync(logsDir, { recursive: true }) } catch {}
  errorLogPath = join(logsDir, 'errors.log')
  return errorLogPath
}

function rotateIfOversized(path: string): void {
  try {
    const { size } = statSync(path)
    if (size < MAX_LOG_BYTES) return
    try { renameSync(path, `${path}.old`) } catch {}
  } catch { /* missing file — nothing to rotate */ }
}

function formatDetail(detail: unknown): string {
  if (detail instanceof Error) return detail.stack ?? detail.message
  if (typeof detail === 'string') return detail
  try { return JSON.stringify(detail) } catch { return String(detail) }
}

export function logCrash(kind: string, detail: unknown): void {
  if (disabled || inFlight) return
  inFlight = true
  try {
    const line = `[${new Date().toISOString()}] ${kind}\n${formatDetail(detail)}\n\n`
    try {
      const path = ensureErrorLogPath()
      rotateIfOversized(path)
      appendFileSync(path, line)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code
      if (code && FATAL_FS_CODES.has(code)) disabled = true
    }
    // Mirror to stdout, but never let a stdout failure escape — a broken
    // pipe / EIO here is what triggered the original infinite loop.
    try { console.error(kind, detail) } catch { /* swallowed by design */ }
  } finally {
    inFlight = false
  }
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
