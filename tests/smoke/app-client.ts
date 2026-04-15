import { readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

function loadEnv(): { port: number; secret: string } {
  const raw = readFileSync(join(tmpdir(), 'telescope-smoke-env.json'), 'utf8')
  return JSON.parse(raw)
}

let _env: { port: number; secret: string } | null = null
function env() {
  if (!_env) _env = loadEnv()
  return _env
}

const baseUrl = () => `http://127.0.0.1:${env().port}`
const secret = () => env().secret

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Telescope-Secret': secret(),
  }
}

function headersWithSession(sessionId?: string, clientName?: string): Record<string, string> {
  return {
    ...headers(),
    ...(sessionId ? { 'X-Telescope-Session-Id': sessionId } : {}),
    ...(clientName ? { 'X-Telescope-Client-Name': clientName } : {}),
  }
}

async function get<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, { headers: headers() })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

async function getWithSession<T = unknown>(path: string, sessionId?: string, clientName?: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: headersWithSession(sessionId, clientName),
  })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

async function post<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: headers(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

async function del<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'DELETE',
    headers: headers(),
  })
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

// --- Health ---

export function getHealth() {
  return get<{ version: string }>('/health')
}

export function getCdpProxyDebug() {
  return get<{
    registrations: Array<{
      token: string
      frameId: string
      sessionId: string | null
      status: string
      hasActiveClient: boolean
    }>
    metrics: {
      registrationsCreated: number
      registrationsReused: number
      upstreamConnects: number
      upstreamReconnects: number
      interceptedClicks: number
      interceptedScrolls: number
    }
  }>('/debug/cdp-proxy')
}

// --- Workspace ---

export function getWorkspace() {
  return get<{ entities: { id: string; kind: string }[]; edges: unknown[]; selection: unknown; camera: unknown }>('/workspace')
}

export function getSidebar() {
  return get<{
    items: Array<{
      kind: 'frame' | 'text' | 'file' | 'group'
      id: string
      label: string
      children?: unknown[]
      entityCount?: number
    }>
  }>('/sidebar')
}

// --- Frames ---

export function createFrames(frames: { url: string; presetIndex?: number; canvasX?: number; canvasY?: number }[]) {
  return post<{ frameIds: string[] }>('/frames/create', { frames })
}

export function createFocusedFrame(input: {
  sourceFrameId?: string
  presetIndex?: number
  canvasX: number
  canvasY: number
}) {
  return post<{ frameId: string }>('/frames/create-at-position', input)
}

export function deleteFrames(frameIds: string[]) {
  return post<{ deletedFrameIds: string[] }>('/frames/delete', { frameIds })
}

export function takeScreenshot(frameId?: string) {
  return post<{ base64: string; mimeType: string }>('/frames/screenshot', { frameId })
}

export function getFrameCdpTarget(frameId: string, sessionId?: string, clientName?: string) {
  return getWithSession<{
    frameId: string
    targetId: string
    webSocketDebuggerUrl: string
    url: string
    title: string
  }>(`/frames/${encodeURIComponent(frameId)}/cdp-target`, sessionId, clientName)
}

export function takeSnapshot(frameId?: string) {
  return post<{ snapshot: string }>('/frames/snapshot', { frameId })
}

export function takeAgentSnapshot(frameId?: string) {
  return post<{ snapshot: { frameId: string; url: string; title: string; nodes: Array<{
    ref: string
    depth: number
    tagName: string
    interactive: boolean
    bounds: { x: number; y: number; width: number; height: number }
  }> } }>('/frames/agent-snapshot', { frameId })
}

export function getPresence() {
  return get<{ cursors: Array<{
    sessionId: string
    clientName: string
    surface?: 'canvas' | 'frame'
    activity?: 'traveling' | 'acting' | 'waiting' | 'thinking' | 'idle'
    frameId?: string | null
    frameX?: number | null
    frameY?: number | null
    labelKey?: string | null
    taskLabel?: string | null
    labelHint?: string | null
    targetRef?: string | null
    targetRefSource?: string | null
    targetName?: string | null
    targetRect?: { x: number; y: number; width: number; height: number } | null
  }> }>('/session/presence')
}

export function postPresence(body: unknown) {
  return post<{ ok: true }>('/session/presence', body)
}

export function openMcpSession(sessionId: string, clientName?: string) {
  return post<{ ok: true }>('/mcp/session/open', { sessionId, clientName })
}

export function pingMcpSession(sessionId: string, clientName?: string) {
  return post<{ ok: true }>('/mcp/session/ping', { sessionId, clientName })
}

export function closeMcpSession(sessionId: string) {
  return post<{ ok: true }>('/mcp/session/close', { sessionId })
}

export function resetSmokeState() {
  return post<{ ok: true }>('/test/reset-state')
}

export function findFrameTarget(body: unknown) {
  return post<{ target: {
    targetRef?: string | null
    targetRefSource?: string | null
    targetName?: string | null
    targetRect: { x: number; y: number; width: number; height: number }
    frameX: number
    frameY: number
  } }>('/frames/find-target', body)
}

// --- Text entities ---

export function getTextEntities() {
  return get<{ textEntities: { id: string; text: string; color?: string; canvasX: number; canvasY: number }[] }>('/text-entities')
}

export async function createTextEntities(items: { canvasX: number; canvasY: number; text?: string; color?: string }[]): Promise<{ ids: string[] }> {
  if (items.length === 1) {
    // Single item returns TextEntity directly
    const entity = await post<{ id: string }>('/text-entities/create', items[0])
    return { ids: [entity.id] }
  }
  const result = await post<{ items: { id: string }[] }>('/text-entities/create', { items })
  return { ids: result.items.map((i) => i.id) }
}

export function updateTextEntities(items: { id: string; patch: { text?: string; color?: string; canvasX?: number; canvasY?: number } }[]) {
  return post<{ items: { id: string }[] }>('/text-entities/update', { items })
}

export function deleteTextEntities(ids: string[]) {
  return post<{ deleted: string[] }>('/text-entities/delete', { ids })
}

// --- Selection ---

export function getSelection() {
  return get<{ selectedEntityId?: string; selectedEntityIds?: string[]; selectedGroupId?: string }>('/selection')
}

export function getSelectionOverlayState() {
  return get<{ pages: { frameId: string; interactive: boolean; multiSelected: boolean }[] }>('/selection/overlay-state')
}

export function deselectSelection() {
  return post('/selection/deselect')
}

export function selectPage(pageId: string) {
  return post<{ ok: boolean; selection: { selectedEntityId?: string; selectedEntityIds?: string[]; selectedGroupId?: string } }>(
    '/selection/select-page',
    { pageId },
  )
}

export function selectEntity(entityId: string, entityKind: 'frame' | 'text' | 'file' | 'edge') {
  return post<{ ok: true; selection: { selectedEntityId?: string; selectedEntityIds?: string[]; selectedGroupId?: string } }>(
    '/selection/select-entity',
    { entityId, entityKind },
  )
}

export function selectEntities(entityIds: string[]) {
  return post('/selection/select-entities', { entityIds })
}

export function selectGroup(groupId: string) {
  return post('/selection/select-group', { groupId })
}

export function enterGroup(groupId: string) {
  return post('/selection/enter-group', { groupId })
}

export function createGroup(entityIds: string[], label?: string) {
  return post<{ id: string; entityIds: string[] }>('/groups/create', { entityIds, label })
}

export function ungroup(groupId: string) {
  return post<{ entityIds: string[] }>('/groups/ungroup', { groupId })
}

export function deleteGroups(groupIds: string[]) {
  return post<{ deletedGroupIds: string[] }>('/groups/delete', { groupIds })
}

// --- Camera ---

export function focusCamera(targets: { frameIds?: string[]; bounds?: { x: number; y: number; width: number; height: number } }) {
  return post('/camera/focus', targets)
}

// --- Test-only: interaction controller, focus, drop ---

export type InteractionMode =
  | { kind: 'idle' }
  | { kind: 'panning' }
  | { kind: 'marquee'; origin: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'dragging-entities'; ids: string[]; anchor: { x: number; y: number } }
  | { kind: 'resizing-entity'; id: string; edge: string }
  | { kind: 'dragging-edge'; from: unknown; target: unknown }
  | { kind: 'editing-text'; id: string }

export type InteractionToken = { id: string; mode: string }
export type CancelReason = 'blur' | 'escape' | 'undo' | 'tab-switch' | 'external'

export type TryEnterInput =
  | { kind: 'panning' }
  | { kind: 'marquee' }
  | { kind: 'dragging-entities'; entityIds: string[] }
  | { kind: 'resizing-entity'; target: { kind: string; id: string } }
  | { kind: 'editing-text'; entityId: string }
  | { kind: 'dragging-edge'; from: { kind: string; id: string }; fromSide: 'top' | 'right' | 'bottom' | 'left' }

export function getInteractionMode() {
  return get<{ mode: InteractionMode }>('/test/interaction/mode')
}

export async function beginInteraction(input: TryEnterInput): Promise<InteractionToken | { refused: true; reason: string }> {
  const res = await fetch(`${baseUrl()}/test/interaction/begin`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(input),
  })
  const data = (await res.json()) as { token?: InteractionToken; refused?: true; reason?: string }
  if (res.status === 409 && data.refused) {
    return { refused: true, reason: data.reason ?? 'unknown' }
  }
  if (!res.ok) throw new Error(`POST /test/interaction/begin → ${res.status}`)
  return data.token!
}

export function commitInteraction(token: InteractionToken) {
  return post<{ ok: true; mode: InteractionMode }>('/test/interaction/commit', { token })
}

export function cancelInteraction(token: InteractionToken, reason: CancelReason) {
  return post<{ ok: true; mode: InteractionMode }>('/test/interaction/cancel', { token, reason })
}

export function cancelActiveInteraction(reason: CancelReason) {
  return post<{ ok: true; mode: InteractionMode }>('/test/interaction/cancel-active', { reason })
}

export function resetInteraction() {
  return post<{ ok: true }>('/test/interaction/reset')
}

export type FocusKey = 'bgView' | 'aboveView' | 'toolbar' | 'sidebar' | string | null
export type FocusTarget =
  | { kind: 'bgView' }
  | { kind: 'aboveView' }
  | { kind: 'toolbar' }
  | { kind: 'sidebar' }
  | { kind: 'page'; id: string }

export function getCurrentFocus() {
  return get<{ focused: FocusKey }>('/test/focus/current')
}

export function requestFocus(target: FocusTarget) {
  return post<{ ok: true }>('/test/focus/request', { target })
}

export function consumeDragId(dragId: string) {
  return post<{ wasConsumed: boolean }>('/test/drop/consume-drag-id', { dragId })
}

export function resetDropOwner() {
  return post<{ ok: true }>('/test/drop/reset')
}
