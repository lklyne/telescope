import type { LayoutUpdateData } from './types'
import { GRID_SIZE } from './constants'

export {
  canvasToScreenX,
  canvasToScreenY,
  canvasToScreenPoint,
  screenPointToCanvasPoint,
  screenRectToCanvasRect,
  toOverlayY,
} from './coords'
export type { CanvasPoint, ScreenPoint, ScreenRect } from './coords'

type ViewportWheelAction =
  | {
      kind: 'zoom'
      deltaY: number
      mouseX: number
      mouseY: number
    }
  | {
      kind: 'pan'
      deltaX: number
      deltaY: number
    }

export function normalizeRect(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
) {
  const left = Math.min(startX, currentX)
  const top = Math.min(startY, currentY)
  return {
    left,
    top,
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  }
}

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

export function isOverlayUiTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[data-overlay-ui]'))
}

function hasNoModifierKeys(
  event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
}

export function isPlainShortcutKey(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
  key: string,
): boolean {
  return event.key.toLowerCase() === key.toLowerCase() && hasNoModifierKeys(event)
}

export function isCommandShortcutKey(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
  key: string,
): boolean {
  return (
    event.key.toLowerCase() === key.toLowerCase() &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey
  )
}

export function classifyViewportWheel(event: Pick<WheelEvent, 'metaKey' | 'ctrlKey' | 'deltaX' | 'deltaY' | 'screenX' | 'screenY'>): ViewportWheelAction {
  if (event.metaKey || event.ctrlKey) {
    return {
      kind: 'zoom',
      deltaY: event.deltaY,
      mouseX: event.screenX,
      mouseY: event.screenY,
    }
  }
  return {
    kind: 'pan',
    deltaX: event.deltaX,
    deltaY: event.deltaY,
  }
}

export function shouldStartMouseViewportPan(event: Pick<MouseEvent, 'button'>): boolean {
  return event.button === 1
}

export function middleDragDelta(
  previous: { screenX: number; screenY: number },
  next: Pick<MouseEvent, 'screenX' | 'screenY'>,
) {
  return {
    deltaX: previous.screenX - next.screenX,
    deltaY: previous.screenY - next.screenY,
  }
}
