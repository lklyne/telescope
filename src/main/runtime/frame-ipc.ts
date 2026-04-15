import { randomUUID } from 'crypto'
import { findPageById, selectedPage } from './runtime-context'
import { safeSend } from './safe-send'

const pendingFrameRequests = new Map<
  string,
  {
    frameId: string
    channel: string
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
    timer: NodeJS.Timeout
  }
>()

const pendingDetailRequests = new Map<string, { frameId: string; nodeId: string }>()

export function requestNodeDetail(frameId: string, nodeId: string): void {
  const page = findPageById(frameId)
  if (!page || page.pageView.webContents.isDestroyed()) return
  const requestId = randomUUID()
  pendingDetailRequests.set(requestId, { frameId, nodeId })
  safeSend(page.pageView.webContents, 'resolve-node-detail', { nodeId, requestId })
}

export function takePendingDetailRequest(
  requestId: string,
): { frameId: string; nodeId: string } | undefined {
  const request = pendingDetailRequests.get(requestId)
  if (!request) return undefined
  pendingDetailRequests.delete(requestId)
  return request
}

export function sendFrameIpc(
  frameId: string | undefined,
  channel: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const page = frameId ? findPageById(frameId) : selectedPage()
  if (!page || page.pageView.webContents.isDestroyed()) {
    return Promise.reject(
      new Error(frameId ? `Frame not found: ${frameId}` : 'No frame selected'),
    )
  }
  const resolvedFrameId = page.id
  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingFrameRequests.delete(requestId)
      reject(new Error(`Timed out waiting for ${channel}-response`))
    }, 5_000)
    pendingFrameRequests.set(requestId, {
      frameId: resolvedFrameId,
      channel,
      resolve,
      reject,
      timer,
    })
    safeSend(page.pageView.webContents, channel, { ...payload, requestId })
  })
}

// Drop any pending requests tied to a frame that's being destroyed. Without
// this, the 5s timer in sendFrameIpc keeps a closure over the doomed
// WebContents alive; when it fires later, V8 GC may sweep the already-freed
// native wrappable and segfault the main process.
export function clearPendingRequestsForFrame(frameId: string): void {
  for (const [requestId, pending] of pendingFrameRequests) {
    if (pending.frameId !== frameId) continue
    clearTimeout(pending.timer)
    pendingFrameRequests.delete(requestId)
    pending.reject(new Error(`Frame ${frameId} destroyed before ${pending.channel}-response`))
  }
  for (const [requestId, detail] of pendingDetailRequests) {
    if (detail.frameId === frameId) pendingDetailRequests.delete(requestId)
  }
}

export function handleFrameIpcResponse(payload: {
  requestId: string
  data: unknown
}): void {
  const pending = pendingFrameRequests.get(payload.requestId)
  if (!pending) return
  pendingFrameRequests.delete(payload.requestId)
  clearTimeout(pending.timer)
  pending.resolve(payload.data)
}
