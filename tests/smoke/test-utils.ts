import WebSocket from 'ws'
import { expect } from 'vitest'
import {
  flushWorkspaceAutosave,
  getDiskSnapshot,
  getUndoState,
  getWorkspace,
  redoWorkspace,
  startTransactionCounter,
  stopTransactionCounter,
  undoWorkspace,
  type DiskSnapshot,
} from './app-client'

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Force a synchronous autosave flush, then return the .canvas file content
 * for the active tab. Use this in persistence assertions instead of sleeping
 * past the 350ms debounce.
 */
export async function flushAndReadDiskSnapshot(tabId?: string): Promise<DiskSnapshot> {
  await flushWorkspaceAutosave()
  return getDiskSnapshot(tabId)
}

/**
 * Wait past the autosave debounce window and return the .canvas file content
 * for the active tab. Use when the test is explicitly verifying debounce
 * timing (the 350ms window in workspace-persistence.ts).
 */
export async function waitForAutosave(tabId?: string): Promise<DiskSnapshot> {
  // Debounce is 350ms; pad to defeat scheduling jitter.
  await wait(500)
  return getDiskSnapshot(tabId)
}

/**
 * Count Y.Doc afterTransaction events during the callback. A single user
 * mutation should produce exactly one transaction. Anything higher implies
 * a forward-sync echo loop.
 */
export async function observeYDocTransactions(
  fn: () => Promise<void>,
): Promise<number> {
  await startTransactionCounter()
  await fn()
  // queueMicrotask in workspace-observers schedules the sync; wait a tick.
  await wait(50)
  return (await stopTransactionCounter()).count
}

export async function waitFor<T>(
  factory: () => Promise<T>,
  predicate: (value: T) => boolean,
  message: string,
  { maxAttempts = 20, intervalMs = 100 }: { maxAttempts?: number; intervalMs?: number } = {},
): Promise<T> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const value = await factory()
      if (predicate(value)) return value
    } catch (error) {
      lastError = error
    }
    await wait(intervalMs)
  }
  throw lastError instanceof Error ? lastError : new Error(message)
}

export async function openWebSocket(url: string): Promise<WebSocket> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(url)
        socket.once('open', () => resolve(socket))
        socket.once('error', reject)
      })
    } catch {
      if (attempt === 4) throw new Error(`Failed to connect to ${url} after 5 attempts`)
      await wait(200)
    }
  }
  throw new Error('unreachable')
}

export function closeWebSocket(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    socket.once('close', () => resolve())
    socket.close()
  })
}

// --- Lifecycle helpers ---
//
// The two helpers below codify the Phase 3 lifecycle contract: persisted
// entities round-trip through the .canvas file, and entity-shaped mutations
// round-trip through the undo stack. Reach for them when you want a smoke
// test to assert "this mutation survives a relaunch" or "this mutation is
// undoable", instead of only asserting "this mutation appeared in a
// snapshot once."

// JSON Canvas spec uses `link` for live-page nodes; the runtime calls the
// same entity a `page`. Normalise both sides to a single representation so
// the disk/runtime comparison is one set equality, not a kind-by-kind
// crosswalk.
const DISK_TYPE_TO_RUNTIME_KIND: Record<string, string> = {
  link: 'page',
  text: 'text',
  file: 'file',
  group: 'group',
}

type EntityFingerprint = { id: string; kind: string }

function sortFingerprints(items: EntityFingerprint[]): EntityFingerprint[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id))
}

async function captureRuntimeFingerprints(): Promise<EntityFingerprint[]> {
  const ws = await getWorkspace()
  return sortFingerprints(
    (ws.entities as Array<{ id: string; kind: string }>).map((e) => ({
      id: e.id,
      kind: e.kind,
    })),
  )
}

async function captureDiskFingerprints(): Promise<EntityFingerprint[]> {
  await flushWorkspaceAutosave()
  const disk = await getDiskSnapshot()
  return sortFingerprints(
    (disk.doc?.nodes ?? []).map((node) => ({
      id: node.id,
      kind: DISK_TYPE_TO_RUNTIME_KIND[node.type] ?? node.type,
    })),
  )
}

/**
 * Runs `setup`, then asserts the post-setup runtime entities round-trip to
 * the .canvas file on disk after the autosave is flushed.
 *
 * Proves the post-setup state would survive a dirty quit + relaunch — if
 * the autosave drops the mutation (e.g. forward sync didn't fire, or
 * `scheduleWorkspaceAutosave()` is commented out), disk and runtime
 * diverge and the assertion fails.
 *
 * Use this on tests that create entities the user expects to persist
 * (pages, text, files, groups, edges).
 */
export async function assertPersists(setup: () => Promise<void>): Promise<void> {
  await setup()
  // queueMicrotask in workspace-observers schedules the forward sync; wait
  // a tick so the disk snapshot taken below sees the post-setup state.
  await wait(50)
  const runtime = await captureRuntimeFingerprints()
  const disk = await captureDiskFingerprints()
  expect(disk).toEqual(runtime)
}

/**
 * Runs `setup`, then exercises the undo/redo stack: `undoCount` undos must
 * restore the pre-setup runtime entities, and the matching number of redos
 * must restore the post-setup entities.
 *
 * `undoCount` defaults to 1 — most setups create a single undoable step.
 * Pass a higher number for setups that issue multiple distinct mutations
 * (e.g. create two entities one at a time). The single-item create path is
 * deterministic; batch creates go through `staggerOperation` and leave the
 * stack non-deterministic, so prefer single creates inside `setup`.
 */
export async function assertUndoable(
  setup: () => Promise<void>,
  { undoCount = 1 }: { undoCount?: number } = {},
): Promise<void> {
  const pre = await captureRuntimeFingerprints()
  await setup()
  await wait(50)
  const post = await captureRuntimeFingerprints()
  expect(post).not.toEqual(pre)

  for (let i = 0; i < undoCount; i++) {
    if (!(await getUndoState()).canUndo) break
    await undoWorkspace()
  }
  const afterUndo = await captureRuntimeFingerprints()
  expect(afterUndo).toEqual(pre)

  for (let i = 0; i < undoCount; i++) {
    if (!(await getUndoState()).canRedo) break
    await redoWorkspace()
  }
  const afterRedo = await captureRuntimeFingerprints()
  expect(afterRedo).toEqual(post)
}
