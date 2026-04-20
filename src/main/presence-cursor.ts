import type { IncomingMessage } from 'http'
import type {
  PresenceActivity,
  PresenceLabelKey,
  PresenceSurface,
  PresenceTargetRect,
  PresenceTargetRefSource,
} from '../shared/types'
import {
  PRESENCE_BATCH_BUDGET_MS,
  PRESENCE_STEP_DELAY_MS,
  PRESENCE_THINKING_DELAY_MS,
} from '../shared/presence-timing'
import {
  getTextEntities,
  getFileEntities,
} from './runtime/document-commands'
import { pages } from './runtime/runtime-context'
import {
  resolveSession,
  mcpSessions,
  MCP_SESSION_TIMEOUT_MS,
} from './presence-session'

// --- Types ---

export interface PresenceCursorEntry {
  sessionId: string
  clientName: string
  color: string
  canvasX: number
  canvasY: number
  surface: PresenceSurface
  activity: PresenceActivity
  frameId?: string | null
  frameX?: number | null
  frameY?: number | null
  labelKey: PresenceLabelKey | null
  taskLabel?: string | null
  labelHint?: string | null
  labelParams?: Record<string, string | number | boolean> | null
  targetRef?: string | null
  targetRefSource?: PresenceTargetRefSource | null
  targetName?: string | null
  targetRect?: PresenceTargetRect | null
  updatedAt: number
}

export interface ActivePresenceTask {
  sessionId: string
  clientName: string
  taskLabel: string | null
  surface: PresenceSurface
  frameId: string | null
  frameX: number | null
  frameY: number | null
  canvasX: number | null
  canvasY: number | null
  targetName: string | null
  targetRect: PresenceTargetRect | null
  labelHint: string | null
  updatedAt: number
}

// --- State ---

export const presenceCursors = new Map<string, PresenceCursorEntry>()
export const activePresenceTasks = new Map<string, ActivePresenceTask>()
const presenceChangeListeners = new Set<() => void>()
let presenceExpiryTimer: NodeJS.Timeout | null = null

// --- Constants ---

export const PRESENCE_CURSOR_STEP_DELAY_MS = PRESENCE_STEP_DELAY_MS
const PRESENCE_CURSOR_THINKING_DELAY_MS = PRESENCE_THINKING_DELAY_MS
const PRESENCE_DEPARTURE_GRACE_MS = 1500

// --- Coercion validation sets ---

const PRESENCE_LABEL_KEYS = new Set<PresenceLabelKey>([
  'scan_workspace',
  'find_placement',
  'create_frame',
  'select_frame',
  'attach_frame',
  'inspect_page',
  'find_target',
  'click_target',
  'type_text',
  'select_option',
  'wait_page',
  'scroll_page',
  'read_content',
  'add_annotation',
  'thinking',
  'idle',
])

const PRESENCE_ACTIVITIES = new Set<PresenceActivity>([
  'traveling',
  'acting',
  'waiting',
  'thinking',
  'idle',
  'departing',
])

const PRESENCE_SURFACES = new Set<PresenceSurface>(['canvas', 'frame'])

let thinkingTimer: NodeJS.Timeout | null = null
export let activeScanId = 0
export function bumpActiveScanId(): number {
  return ++activeScanId
}

// --- Presence core ---

export function notifyPresenceChanged(): void {
  for (const listener of presenceChangeListeners) listener()
}

function schedulePresenceExpiry(): void {
  if (presenceExpiryTimer) clearTimeout(presenceExpiryTimer)
  presenceExpiryTimer = setTimeout(() => {
    presenceExpiryTimer = null
    const before = presenceCursors.size + activePresenceTasks.size
    expirePresenceCursors(Date.now())
    const after = presenceCursors.size + activePresenceTasks.size
    if (after !== before) notifyPresenceChanged()
    if (presenceCursors.size > 0 || activePresenceTasks.size > 0) {
      schedulePresenceExpiry()
    }
  }, 2_000)
}

export function deriveColor(sessionId: string): string {
  let hash = 0
  for (let i = 0; i < sessionId.length; i++) {
    hash = ((hash << 5) - hash + sessionId.charCodeAt(i)) | 0
  }
  const hue = ((hash % 360) + 360) % 360
  return `hsl(${hue}, 70%, 55%)`
}

export function removePresenceCursor(id: string): void {
  presenceCursors.delete(id)
}

/**
 * Transition a presence cursor to `departing` and schedule its removal.
 * Called from session close, CDP transport drop, and the expiry sweep when
 * the underlying MCP session has gone away. Safe to call multiple times
 * and when no cursor exists.
 */
export function beginPresenceDeparture(
  sessionId: string,
  removeAfterMs: number = PRESENCE_DEPARTURE_GRACE_MS,
): void {
  const hadTask = activePresenceTasks.delete(sessionId)
  const existing = presenceCursors.get(sessionId)
  if (!existing) {
    if (hadTask) notifyPresenceChanged()
    return
  }
  if (existing.activity === 'departing') return
  presenceCursors.set(sessionId, {
    ...existing,
    activity: 'departing',
    labelKey: null,
    updatedAt: Date.now(),
  })
  notifyPresenceChanged()
  setTimeout(() => {
    const current = presenceCursors.get(sessionId)
    if (!current || current.activity !== 'departing') return
    removePresenceCursor(sessionId)
    notifyPresenceChanged()
  }, removeAfterMs)
}

function isSessionLive(sessionId: string, now: number): boolean {
  const session = mcpSessions.get(sessionId)
  if (!session) return false
  return now - session.lastSeenAt <= MCP_SESSION_TIMEOUT_MS
}

function expirePresenceCursors(now: number): void {
  for (const [id, cursor] of presenceCursors) {
    if (cursor.activity === 'departing') {
      if (now - cursor.updatedAt > PRESENCE_DEPARTURE_GRACE_MS) {
        removePresenceCursor(id)
        activePresenceTasks.delete(id)
      }
      continue
    }
    if (!isSessionLive(id, now)) {
      beginPresenceDeparture(id)
      continue
    }
    if (!activePresenceTasks.has(id) && now - cursor.updatedAt > 10_000) {
      removePresenceCursor(id)
    }
  }
  // Clean up orphaned active tasks whose cursors have already been removed.
  for (const id of activePresenceTasks.keys()) {
    if (!presenceCursors.has(id) && !isSessionLive(id, now)) {
      activePresenceTasks.delete(id)
    }
  }
}

export function getPresenceCursors(): PresenceCursorEntry[] {
  expirePresenceCursors(Date.now())
  return [...presenceCursors.values()]
}

export function onPresenceCursorsChanged(listener: () => void): () => void {
  presenceChangeListeners.add(listener)
  return () => { presenceChangeListeners.delete(listener) }
}

// --- Coercion helpers ---

export function coercePresenceLabelKey(value: unknown): PresenceLabelKey | null {
  return typeof value === 'string' && PRESENCE_LABEL_KEYS.has(value as PresenceLabelKey)
    ? (value as PresenceLabelKey)
    : null
}

export function coercePresenceActivity(value: unknown): PresenceActivity | null {
  return typeof value === 'string' && PRESENCE_ACTIVITIES.has(value as PresenceActivity)
    ? (value as PresenceActivity)
    : null
}

export function coercePresenceSurface(value: unknown): PresenceSurface | null {
  return typeof value === 'string' && PRESENCE_SURFACES.has(value as PresenceSurface)
    ? (value as PresenceSurface)
    : null
}

export function coercePresenceTargetRefSource(value: unknown): PresenceTargetRefSource | null {
  return value === 'telescope' || value === 'agent-browser'
    ? value
    : null
}

// --- Cursor mutation functions ---

export function upsertPresenceCursor(
  request: IncomingMessage,
  patch: {
    body?: Record<string, unknown>
    canvasX?: number
    canvasY?: number
    surface?: PresenceSurface
    activity?: PresenceActivity
    frameId?: string | null
    frameX?: number | null
    frameY?: number | null
    labelKey?: PresenceLabelKey | null
    taskLabel?: string | null
    labelHint?: string | null
    labelParams?: Record<string, string | number | boolean> | null
    targetRef?: string | null
    targetRefSource?: PresenceTargetRefSource | null
    targetName?: string | null
    targetRect?: PresenceTargetRect | null
  },
): void {
  const resolved = resolveSession(request, patch.body)
  if (!resolved) return
  const { sessionId, session } = resolved

  for (const [id, cursor] of presenceCursors) {
    if (cursor.clientName === session.clientName && id !== sessionId) {
      removePresenceCursor(id)
    }
  }

  const existing = presenceCursors.get(sessionId)
  presenceCursors.set(sessionId, {
    sessionId,
    clientName: session.clientName,
    color: existing?.color ?? deriveColor(sessionId),
    canvasX: patch.canvasX ?? existing?.canvasX ?? 0,
    canvasY: patch.canvasY ?? existing?.canvasY ?? 0,
    surface: patch.surface ?? existing?.surface ?? 'canvas',
    activity: patch.activity ?? existing?.activity ?? 'acting',
    frameId:
      patch.frameId === undefined
        ? existing?.frameId ?? null
        : patch.frameId,
    frameX:
      patch.frameX === undefined
        ? existing?.frameX ?? null
        : patch.frameX,
    frameY:
      patch.frameY === undefined
        ? existing?.frameY ?? null
        : patch.frameY,
    labelKey:
      patch.labelKey === undefined
        ? existing?.labelKey ?? null
        : patch.labelKey,
    taskLabel:
      patch.taskLabel === undefined
        ? existing?.taskLabel ?? activePresenceTasks.get(sessionId)?.taskLabel ?? null
        : patch.taskLabel,
    labelHint:
      patch.labelHint === undefined
        ? existing?.labelHint ?? activePresenceTasks.get(sessionId)?.labelHint ?? null
        : patch.labelHint,
    labelParams:
      patch.labelParams === undefined
        ? existing?.labelParams ?? null
        : patch.labelParams,
    targetRef:
      patch.targetRef === undefined
        ? existing?.targetRef ?? null
        : patch.targetRef,
    targetRefSource:
      patch.targetRefSource === undefined
        ? existing?.targetRefSource ?? null
        : patch.targetRefSource,
    targetName:
      patch.targetName === undefined
        ? existing?.targetName ?? null
        : patch.targetName,
    targetRect:
      patch.targetRect === undefined
        ? existing?.targetRect ?? null
        : patch.targetRect,
    updatedAt: Date.now(),
  })

  schedulePresenceExpiry()
  notifyPresenceChanged()
}

export function upsertActivePresenceTask(
  request: IncomingMessage,
  patch: {
    body?: Record<string, unknown>
    taskLabel?: string | null
    surface?: PresenceSurface
    frameId?: string | null
    frameX?: number | null
    frameY?: number | null
    canvasX?: number | null
    canvasY?: number | null
    targetName?: string | null
    targetRect?: PresenceTargetRect | null
    labelHint?: string | null
  },
): void {
  const resolved = resolveSession(request, patch.body)
  if (!resolved) return
  const { sessionId, session } = resolved
  const existing = activePresenceTasks.get(sessionId)
  activePresenceTasks.set(sessionId, {
    sessionId,
    clientName: session.clientName,
    taskLabel:
      patch.taskLabel === undefined
        ? existing?.taskLabel ?? null
        : patch.taskLabel,
    surface: patch.surface ?? existing?.surface ?? 'canvas',
    frameId:
      patch.frameId === undefined
        ? existing?.frameId ?? null
        : patch.frameId,
    frameX:
      patch.frameX === undefined
        ? existing?.frameX ?? null
        : patch.frameX,
    frameY:
      patch.frameY === undefined
        ? existing?.frameY ?? null
        : patch.frameY,
    canvasX:
      patch.canvasX === undefined
        ? existing?.canvasX ?? null
        : patch.canvasX,
    canvasY:
      patch.canvasY === undefined
        ? existing?.canvasY ?? null
        : patch.canvasY,
    targetName:
      patch.targetName === undefined
        ? existing?.targetName ?? null
        : patch.targetName,
    targetRect:
      patch.targetRect === undefined
        ? existing?.targetRect ?? null
        : patch.targetRect,
    labelHint:
      patch.labelHint === undefined
        ? existing?.labelHint ?? null
        : patch.labelHint,
    updatedAt: Date.now(),
  })
  schedulePresenceExpiry()
}

export function clearActivePresenceTask(
  request: IncomingMessage,
  body?: Record<string, unknown>,
): void {
  const resolved = resolveSession(request, body)
  if (!resolved) return
  activePresenceTasks.delete(resolved.sessionId)
  removePresenceCursor(resolved.sessionId)
  schedulePresenceExpiry()
  notifyPresenceChanged()
}

// --- Timer and animation ---

export function scheduleThinkingState(request: IncomingMessage): void {
  if (thinkingTimer) clearTimeout(thinkingTimer)
  thinkingTimer = setTimeout(() => {
    thinkingTimer = null
    const resolved = resolveSession(request)
    if (!resolved) return
    const existing = presenceCursors.get(resolved.sessionId)
    if (!existing || existing.activity === 'idle') return
    const activeTask = activePresenceTasks.get(resolved.sessionId)
    if (activeTask) {
      activeTask.updatedAt = Date.now()
    }
    presenceCursors.set(resolved.sessionId, {
      ...existing,
      activity: 'thinking',
      labelKey: 'thinking',
      taskLabel: existing.taskLabel ?? activeTask?.taskLabel ?? null,
      labelHint: activeTask?.labelHint ?? existing.labelHint ?? null,
      updatedAt: Date.now(),
    })
    schedulePresenceExpiry()
    notifyPresenceChanged()
  }, PRESENCE_CURSOR_THINKING_DELAY_MS)
}

export function allEntityPositions(): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = []
  for (const page of pages) {
    positions.push({ x: page.canvasX, y: page.canvasY })
  }
  for (const te of getTextEntities()) {
    positions.push({ x: te.canvasX, y: te.canvasY })
  }
  for (const fe of getFileEntities()) {
    positions.push({ x: fe.canvasX, y: fe.canvasY })
  }
  positions.sort((a, b) => a.y - b.y || a.x - b.x)
  return positions
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function setPresenceCursorIdle(request: IncomingMessage): void {
  const resolved = resolveSession(request)
  if (!resolved) return
  const existing = presenceCursors.get(resolved.sessionId)
  if (!existing) return
  const activeTask = activePresenceTasks.get(resolved.sessionId)
  presenceCursors.set(resolved.sessionId, {
    ...existing,
    activity: activeTask ? 'thinking' : 'idle',
    labelKey: activeTask ? 'thinking' : 'idle',
    taskLabel: existing.taskLabel ?? activeTask?.taskLabel ?? null,
    labelHint: activeTask?.labelHint ?? existing.labelHint ?? null,
    updatedAt: Date.now(),
  })
  schedulePresenceExpiry()
  notifyPresenceChanged()
}

function movePresenceCursorTo(
  request: IncomingMessage,
  canvasX: number,
  canvasY: number,
  labelKey: PresenceLabelKey | null,
): void {
  const resolved = resolveSession(request)
  if (!resolved) return
  const existing = presenceCursors.get(resolved.sessionId)
  if (!existing) return
  // Skip no-op moves
  if (existing.canvasX === canvasX && existing.canvasY === canvasY && existing.labelKey === labelKey) {
    return
  }
  presenceCursors.set(resolved.sessionId, {
    ...existing,
    canvasX,
    canvasY,
    surface: 'canvas',
    activity: 'traveling',
    labelKey,
    updatedAt: Date.now(),
  })
  notifyPresenceChanged()
}

/**
 * A single enqueued step in a session's mutation drain. Carries its own
 * request so coalesced batches from different callers keep their origin,
 * and its own per-item delay so each batch's pacing is calibrated to the
 * batch size it was enqueued with.
 */
interface MutationStep {
  request: IncomingMessage
  x: number
  y: number
  labelKey: PresenceLabelKey | null
  perItemDelayMs: number
  perform: () => void
}

/**
 * Per-session append-only mutation queues. Rapid-fire requests from the
 * same session append to the running drain; they do not cancel it. This
 * is what lets `telescope delete id1 && telescope delete id2 && ...`
 * actually complete every delete instead of silently dropping all but one.
 */
const mutationQueues = new Map<string, MutationStep[]>()
const mutationRunning = new Set<string>()

export function isMutationRunActive(sessionId: string): boolean {
  return mutationRunning.has(sessionId)
}

/**
 * Drive a cursor gesture over `items`, firing `perform(i)` once the cursor
 * has arrived at each position. Runs to completion — new calls from the
 * same session append to the running drain rather than cancelling it.
 *
 * Pacing: single-item ops get the full PRESENCE_STEP_DELAY_MS so the
 * "move, then act" gesture is clear. Multi-item batches divide
 * PRESENCE_BATCH_BUDGET_MS across their items, so an N-item batch drains
 * in ≈ budget time regardless of N — the tail mutation always lands
 * within one budget window of the request.
 */
export function staggerOperation(
  request: IncomingMessage,
  items: Array<{ x: number; y: number }>,
  labelKey: PresenceLabelKey | null,
  perform: (index: number) => void,
): void {
  if (items.length === 0) return
  const resolved = resolveSession(request)
  if (!resolved) {
    // No session to animate against — run mutations synchronously so the
    // data model stays consistent even when presence can't be rendered.
    for (let i = 0; i < items.length; i++) perform(i)
    return
  }
  const { sessionId } = resolved

  const perItemDelayMs = items.length === 1
    ? PRESENCE_CURSOR_STEP_DELAY_MS
    : Math.max(1, Math.floor(PRESENCE_BATCH_BUDGET_MS / items.length))

  const steps: MutationStep[] = items.map((it, i) => ({
    request,
    x: it.x,
    y: it.y,
    labelKey,
    perItemDelayMs,
    perform: () => perform(i),
  }))

  const queue = mutationQueues.get(sessionId) ?? []
  queue.push(...steps)
  mutationQueues.set(sessionId, queue)

  if (mutationRunning.has(sessionId)) return

  mutationRunning.add(sessionId)
  // Take the cursor from any running scan so the mutation owns the gesture.
  // Mutations themselves don't consult activeScanId — they always complete.
  bumpActiveScanId()
  void (async () => {
    try {
      while (true) {
        const q = mutationQueues.get(sessionId)
        if (!q || q.length === 0) break
        const step = q.shift()!
        movePresenceCursorTo(step.request, step.x, step.y, step.labelKey)
        await delay(step.perItemDelayMs)
        upsertPresenceCursor(step.request, {
          canvasX: step.x,
          canvasY: step.y,
          surface: 'canvas',
          activity: 'acting',
          labelKey: step.labelKey,
        })
        step.perform()
      }
    } finally {
      mutationRunning.delete(sessionId)
      mutationQueues.delete(sessionId)
      setPresenceCursorIdle(request)
    }
  })()
}

/**
 * Animate the cursor across positions without performing any mutation.
 * Used for read scans (workspace listing, etc.). Cancellable via
 * activeScanId — a newer scan or a starting mutation interrupts it.
 * Skipped entirely when a mutation is already draining for this session:
 * scans are decorative and must not fight the mutation for the cursor.
 */
export function animateCursorScan(
  request: IncomingMessage,
  positions: Array<{ x: number; y: number }>,
  labelKey: PresenceLabelKey | null,
): void {
  if (positions.length === 0) return
  const resolved = resolveSession(request)
  if (resolved && mutationRunning.has(resolved.sessionId)) return
  const scanId = bumpActiveScanId()
  void (async () => {
    for (let i = 0; i < positions.length; i++) {
      if (activeScanId !== scanId) return
      movePresenceCursorTo(request, positions[i].x, positions[i].y, labelKey)
      await delay(PRESENCE_CURSOR_STEP_DELAY_MS)
      if (activeScanId !== scanId) return
      upsertPresenceCursor(request, {
        canvasX: positions[i].x,
        canvasY: positions[i].y,
        surface: 'canvas',
        activity: 'acting',
        labelKey,
      })
    }
    setPresenceCursorIdle(request)
  })()
}

// --- Reset ---

export function resetPresenceState(pendingIntents: Map<string, { expiryTimer: NodeJS.Timeout }>): void {
  if (thinkingTimer) {
    clearTimeout(thinkingTimer)
    thinkingTimer = null
  }
  if (presenceExpiryTimer) {
    clearTimeout(presenceExpiryTimer)
    presenceExpiryTimer = null
  }

  for (const pending of pendingIntents.values()) {
    clearTimeout(pending.expiryTimer)
  }
  pendingIntents.clear()
  activePresenceTasks.clear()
  presenceCursors.clear()
  mutationQueues.clear()
  mutationRunning.clear()
  notifyPresenceChanged()
}
