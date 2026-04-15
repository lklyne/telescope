import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Sentry context helpers — breadcrumbs, tags, and install identity.
 *
 * This module is safe to import from anywhere, including Node-only unit
 * tests: all Electron/Sentry modules are lazy-required inside functions
 * and every function is a cheap no-op until `markSentryEnabled()` is
 * called (which only happens from the main process after `initSentry`).
 *
 * Runtime state (workspace, pages, entities) must never be imported here —
 * this module is called FROM those modules. State snapshotting for tag
 * enrichment lives in sentry.ts alongside beforeSend.
 */

let enabled = false

type SentryMain = typeof import('@sentry/electron/main')

let sentryMod: SentryMain | null = null
function sentry(): SentryMain | null {
  if (!enabled) return null
  if (sentryMod) return sentryMod
  sentryMod = require('@sentry/electron/main') as SentryMain
  return sentryMod
}

export function markSentryEnabled(): void {
  enabled = true
}

export function isSentryEnabled(): boolean {
  return enabled
}

export type BreadcrumbCategory =
  | 'interaction'
  | 'selection'
  | 'tab'
  | 'workspace'
  | 'page'
  | 'navigation'
  | 'undo'
  | 'view-mode'
  | 'mcp'

export function breadcrumb(
  category: BreadcrumbCategory,
  message: string,
  data?: Record<string, unknown>,
): void {
  const s = sentry()
  if (!s) return
  s.addBreadcrumb({
    category: `telescope.${category}`,
    message,
    data,
    level: 'info',
  })
}

/**
 * Anonymous per-install identifier. Lets Sentry count distinct users
 * hitting a given issue without capturing any PII. UUID is persisted in
 * userData/install-id and is opaque — not tied to a person or device.
 */
export function identifyInstall(): void {
  const s = sentry()
  if (!s) return
  try {
    const { app } = require('electron') as typeof import('electron')
    const p = join(app.getPath('userData'), 'install-id')
    let id: string
    if (existsSync(p)) {
      const raw = readFileSync(p, 'utf8').trim()
      if (/^[0-9a-f-]{36}$/i.test(raw)) {
        id = raw
      } else {
        id = randomUUID()
        writeFileSync(p, id)
      }
    } else {
      id = randomUUID()
      writeFileSync(p, id)
    }
    s.setUser({ id })
  } catch {
    // best-effort
  }
}

export function setTag(key: string, value: string | number | boolean | undefined): void {
  const s = sentry()
  if (!s) return
  if (value === undefined) return
  s.setTag(key, String(value))
}

/** One-shot tags set at startup. */
export function setWorkspaceSource(source: 'restored' | 'new'): void {
  setTag('workspace_source', source)
}

export function setAutoUpdateChannel(version: string): void {
  const match = version.match(/-(alpha|beta|rc|nightly)/i)
  setTag('auto_update_channel', match ? match[1].toLowerCase() : 'stable')
}
