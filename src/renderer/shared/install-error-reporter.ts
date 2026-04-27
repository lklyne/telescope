/**
 * Forward renderer-side errors into console.error so the main-process
 * console-message hook (see src/main/crash-log.ts) writes them to
 * errors.log alongside main-process crashes.
 *
 * Without this, a window.onerror or unhandled promise rejection in the
 * renderer is invisible unless DevTools is open.
 */

let installed = false

export function installRendererErrorReporter(label: string): void {
  if (installed) return
  installed = true

  window.addEventListener('error', (event) => {
    const where = event.filename
      ? `${event.filename}:${event.lineno ?? '?'}:${event.colno ?? '?'}`
      : '<unknown>'
    const stack = event.error instanceof Error ? event.error.stack : null
    console.error(
      `[renderer-error:${label}] ${event.message ?? 'unknown error'} at ${where}`,
      stack ?? '',
    )
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const detail = reason instanceof Error
      ? (reason.stack ?? reason.message)
      : safeStringify(reason)
    console.error(`[renderer-unhandled-rejection:${label}] ${detail}`)
  })
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return String(value) }
}
