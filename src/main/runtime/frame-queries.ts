import { selectedPage, findPageById } from './runtime-context'
import { sendFrameIpc } from './frame-ipc'

export async function takeFrameSnapshot(frameId?: string, maxDepth?: number): Promise<unknown> {
  return sendFrameIpc(frameId, 'take-dom-snapshot', { maxDepth: maxDepth ?? 10 })
}

export async function takeFrameAgentSnapshot(frameId?: string, maxDepth?: number): Promise<unknown> {
  return sendFrameIpc(frameId, 'take-dom-snapshot', {
    maxDepth: maxDepth ?? 10,
    structured: true,
  })
}

export async function takeFrameScreenshot(frameId?: string): Promise<string> {
  const page = frameId ? findPageById(frameId) : selectedPage()
  if (!page || page.pageView.webContents.isDestroyed()) {
    throw new Error(frameId ? `Frame not found: ${frameId}` : 'No frame selected')
  }
  const image = await page.pageView.webContents.capturePage()
  return image.toPNG().toString('base64')
}

export async function queryFrameElements(frameId?: string, selector?: string, maxResults?: number): Promise<unknown> {
  if (!selector) throw new Error('selector is required')
  return sendFrameIpc(frameId, 'query-dom-elements', { selector, maxResults: maxResults ?? 20 })
}

export async function queryElementsInRect(
  frameId: string,
  rect: { x: number; y: number; width: number; height: number },
  maxResults?: number,
): Promise<unknown[]> {
  const data = await sendFrameIpc(frameId, 'query-elements-in-rect', {
    rect,
    maxResults: maxResults ?? 15,
  })
  return Array.isArray(data) ? data : []
}
