import WebSocket from 'ws'
import {
  flushWorkspaceAutosave,
  getDiskSnapshot,
  startTransactionCounter,
  stopTransactionCounter,
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
