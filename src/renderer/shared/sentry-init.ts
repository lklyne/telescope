import * as Sentry from '@sentry/electron/renderer'

/**
 * Initialize Sentry in a renderer process.
 *
 * The DSN and all transport config live in the main-process init
 * (`src/main/sentry.ts`). Renderers just opt in — events are forwarded
 * to the main process over IPC and uploaded from there. If the main
 * process has no DSN, this is a no-op.
 *
 * Idempotent and safe to call from every renderer entry point.
 */
let initialized = false

export function initRendererSentry(): void {
  if (initialized) return
  initialized = true
  Sentry.init({})
}
