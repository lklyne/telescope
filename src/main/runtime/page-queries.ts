import { selectedPage, findPageById } from './runtime-context'
import { sendPageIpc } from './page-ipc'

export async function takePageSnapshot(pageId?: string, maxDepth?: number): Promise<unknown> {
  return sendPageIpc(pageId, 'take-dom-snapshot', { maxDepth: maxDepth ?? 10 })
}

export async function takePageAgentSnapshot(pageId?: string, maxDepth?: number): Promise<unknown> {
  return sendPageIpc(pageId, 'take-dom-snapshot', {
    maxDepth: maxDepth ?? 10,
    structured: true,
  })
}

export async function takePageScreenshot(pageId?: string): Promise<string> {
  const page = pageId ? findPageById(pageId) : selectedPage()
  if (!page || page.pageView.webContents.isDestroyed()) {
    throw new Error(pageId ? `Page not found: ${pageId}` : 'No page selected')
  }
  const image = await page.pageView.webContents.capturePage()
  return image.toPNG().toString('base64')
}

export async function queryPageElements(pageId?: string, selector?: string, maxResults?: number): Promise<unknown> {
  if (!selector) throw new Error('selector is required')
  return sendPageIpc(pageId, 'query-dom-elements', { selector, maxResults: maxResults ?? 20 })
}

export async function queryElementsInRect(
  pageId: string,
  rect: { x: number; y: number; width: number; height: number },
  maxResults?: number,
): Promise<unknown[]> {
  const data = await sendPageIpc(pageId, 'query-elements-in-rect', {
    rect,
    maxResults: maxResults ?? 15,
  })
  return Array.isArray(data) ? data : []
}
