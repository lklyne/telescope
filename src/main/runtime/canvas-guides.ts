import type { CanvasGuidesPayload } from '../../shared/canvas-guides'
import { safeSend } from './safe-send'
import { aboveView } from './view-refs'

const EMPTY_GUIDES: CanvasGuidesPayload = { alignmentGuides: [] }

export function broadcastCanvasGuides(payload: CanvasGuidesPayload): void {
  if (!aboveView || aboveView.webContents.isDestroyed()) return
  safeSend(aboveView.webContents, 'canvas-guides', payload)
}

export function clearCanvasGuides(): void {
  broadcastCanvasGuides(EMPTY_GUIDES)
}
