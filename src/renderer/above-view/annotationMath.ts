import type {
  Annotation,
  AnnotationCreateRequest,
  AnnotationDrawing,
  AnnotationDrawingPoint,
  AnnotationDrawingStroke,
  DevtoolsPanelDomRect,
  LayoutUpdateData,
} from '../../shared/types'
import {
  canvasToScreenX,
  canvasToScreenY,
  toOverlayY,
} from '../../shared/gesture-utils'


export interface PendingAnnotation {
  /** Stable id for this draft, used to subscribe live element bbox updates
   *  while the composer is open (ADR 0006). */
  draftId: string
  request: AnnotationCreateRequest
  composerX: number
  composerY: number
  composerWidth: number
}

/**
 * Live-bbox lookup contract used by the popover positioners. The renderer
 * subscribes element-anchored popovers and the composer to per-page bbox
 * updates; positioning consults this lookup so popovers track page scroll.
 */
export interface AnnotationLiveBboxLookup {
  get: (annotationId: string) => DevtoolsPanelDomRect | undefined
  isStale: (annotationId: string) => boolean
}

export interface DrawingSession {
  strokes: AnnotationDrawingStroke[]
  bounds: AnnotationDrawing['bounds']
}

export function snapPointTo45Degrees(
  origin: AnnotationDrawingPoint,
  point: AnnotationDrawingPoint,
): AnnotationDrawingPoint {
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  const distance = Math.hypot(dx, dy)
  if (distance === 0) return point

  const increment = Math.PI / 4
  const snappedAngle = Math.round(Math.atan2(dy, dx) / increment) * increment
  return {
    x: origin.x + Math.cos(snappedAngle) * distance,
    y: origin.y + Math.sin(snappedAngle) * distance,
  }
}

export function pathD(points: AnnotationDrawingPoint[]): string {
  if (!points.length) return ''
  if (points.length === 1) {
    const [point] = points
    return `M ${point.x} ${point.y} L ${point.x + 0.01} ${point.y + 0.01}`
  }
  if (points.length === 2) {
    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ')
  }

  const [firstPoint, secondPoint] = points
  let path = `M ${firstPoint.x} ${firstPoint.y}`
  const firstMidpoint = {
    x: (firstPoint.x + secondPoint.x) / 2,
    y: (firstPoint.y + secondPoint.y) / 2,
  }

  path += ` Q ${firstPoint.x} ${firstPoint.y} ${firstMidpoint.x} ${firstMidpoint.y}`

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]
    const nextPoint = points[index + 1]
    const midpoint = {
      x: (point.x + nextPoint.x) / 2,
      y: (point.y + nextPoint.y) / 2,
    }
    path += ` Q ${point.x} ${point.y} ${midpoint.x} ${midpoint.y}`
  }

  const lastPoint = points[points.length - 1]
  path += ` Q ${lastPoint.x} ${lastPoint.y} ${lastPoint.x} ${lastPoint.y}`
  return path
}

function boundsFromPoints(points: AnnotationDrawingPoint[]): AnnotationDrawing['bounds'] {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}

export function drawingBounds(
  strokes: AnnotationDrawingStroke[],
): AnnotationDrawing['bounds'] {
  const points = strokes.flatMap((stroke) => stroke.points)
  return boundsFromPoints(points)
}

export function canvasRectToScreenRect(
  layout: LayoutUpdateData,
  canvasRect: { x: number; y: number; width: number; height: number },
  minSize = 4,
): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
  const left = canvasToScreenX(layout, canvasRect.x)
  const top = canvasToScreenY(layout, canvasRect.y)
  const right = canvasToScreenX(layout, canvasRect.x + canvasRect.width)
  const bottom = canvasToScreenY(layout, canvasRect.y + canvasRect.height)
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(minSize, right - left),
    height: Math.max(minSize, bottom - top),
  }
}

export function annotationScreenPos(
  annotation: Annotation,
  layout: LayoutUpdateData,
  liveBboxes?: AnnotationLiveBboxLookup,
): { x: number; y: number; transform: string } | null {
  const railAnchor = (
    page: LayoutUpdateData['entities'][number],
    preferredY: number,
  ): { x: number; y: number; transform: string } => {
    const y = Math.min(
      Math.max(preferredY, toOverlayY(layout, page.screenY + 10)),
      toOverlayY(layout, page.screenY + page.screenHeight - 10),
    )
    const rightX = page.screenX + page.screenWidth + 12
    const leftX = page.screenX - 12
    const canUseRight = rightX + 280 <= window.innerWidth
    return canUseRight
      ? { x: rightX, y, transform: 'translate(0, -50%)' }
      : { x: leftX, y, transform: 'translate(-100%, -50%)' }
  }

  const anchor = annotation.anchor
  if (anchor.type === 'canvas') {
    return {
      x: canvasToScreenX(layout, anchor.canvasX),
      y: canvasToScreenY(layout, anchor.canvasY),
      transform: 'translate(0, -50%)',
    }
  }
  if (anchor.type === 'region') {
    const centerX = canvasToScreenX(
      layout,
      anchor.canvasRect.x + anchor.canvasRect.width / 2,
    )
    const bottom = canvasToScreenY(
      layout,
      anchor.canvasRect.y + anchor.canvasRect.height,
    )
    return {
      x: centerX,
      y: toOverlayY(layout, bottom),
      transform: 'translate(-50%, 0)',
    }
  }
  if (anchor.type === 'page' || anchor.type === 'element') {
    const page = layout.entities.find((f) => f.id === anchor.pageId)
    if (!page) return null
    if (anchor.type === 'element' && anchor.boundingBox) {
      const topInset = 8
      const rightInset = 8
      // Prefer the live bbox the page reports on scroll/resize (ADR 0006).
      // The stored `anchor.boundingBox` is captured at creation and goes
      // stale the moment the page scrolls.
      const liveBbox = liveBboxes?.get(annotation.id)
      const bb = liveBbox ?? anchor.boundingBox
      const x =
        page.screenX +
        (bb.x + bb.width) *
          (page.screenWidth / page.width) -
        rightInset
      const y =
        page.screenY +
        bb.y * (page.screenHeight / page.height) +
        topInset
      const clampedX = Math.max(
        page.screenX + rightInset,
        Math.min(x, page.screenX + page.screenWidth - rightInset),
      )
      const clampedY = Math.max(
        page.screenY + topInset,
        Math.min(y, page.screenY + page.screenHeight - topInset),
      )
      return {
        x: clampedX,
        y: toOverlayY(layout, clampedY),
        transform: 'translate(-100%, 0)',
      }
    }
    if (anchor.type === 'page') {
      const y = toOverlayY(layout, page.screenY + anchor.offsetY * page.screenHeight)
      return railAnchor(page, y)
    }
    return railAnchor(page, toOverlayY(layout, page.screenY + page.screenHeight / 2))
  }
  return null
}

const PENDING_VIEWPORT_PADDING = 8
const PENDING_COMPOSER_MARGIN = 8
const PENDING_COMPOSER_MIN_HEIGHT = 52

/**
 * Render-time positioner for an element-anchored pending composer. The
 * stored `composerX/Y/Width` on `PendingAnnotation` is the click-time
 * fallback; we prefer the live bbox the page reports on scroll so the
 * composer follows page content (ADR 0006).
 */
export function pendingElementComposerPosition(
  pending: PendingAnnotation,
  layout: LayoutUpdateData,
  liveBboxes?: AnnotationLiveBboxLookup,
): { left: number; top: number; width: number } {
  const fallback = {
    left: pending.composerX,
    top: pending.composerY,
    width: pending.composerWidth,
  }
  const anchor = pending.request.anchor
  if (anchor.type !== 'element') return fallback
  const liveBbox = liveBboxes?.get(pending.draftId)
  if (!liveBbox) return fallback

  const page = layout.entities.find((candidate) => candidate.id === anchor.pageId)
  if (!page) return fallback
  const contentScreenX =
    'contentScreenX' in page && page.contentScreenX != null ? page.contentScreenX : page.screenX
  const contentScreenY =
    'contentScreenY' in page && page.contentScreenY != null ? page.contentScreenY : page.screenY
  const contentScreenWidth =
    'contentScreenWidth' in page && page.contentScreenWidth != null
      ? page.contentScreenWidth
      : page.screenWidth
  const contentScreenHeight =
    'contentScreenHeight' in page && page.contentScreenHeight != null
      ? page.contentScreenHeight
      : page.screenHeight
  const scaleX = contentScreenWidth / page.width
  const scaleY = contentScreenHeight / page.height
  const elementLeft = contentScreenX + liveBbox.x * scaleX
  const elementTop = toOverlayY(layout, contentScreenY + liveBbox.y * scaleY)
  const elementHeight = liveBbox.height * scaleY
  const pageBottomOverlay = toOverlayY(layout, page.screenY + page.screenHeight)
  const pageTopOverlay = toOverlayY(layout, page.screenY)
  const elementBottom = Math.max(elementTop + elementHeight, pageBottomOverlay)
  const elementTopAnchor = Math.min(elementTop, pageTopOverlay)
  const composerWidth = pending.composerWidth
  const composerX = Math.min(
    Math.max(elementLeft, PENDING_VIEWPORT_PADDING),
    window.innerWidth - composerWidth - PENDING_VIEWPORT_PADDING,
  )
  const canRenderBelow =
    elementBottom + PENDING_COMPOSER_MARGIN + PENDING_COMPOSER_MIN_HEIGHT <=
    window.innerHeight - PENDING_VIEWPORT_PADDING
  const belowY = elementBottom + PENDING_COMPOSER_MARGIN
  const aboveY = elementTopAnchor - PENDING_COMPOSER_MARGIN - PENDING_COMPOSER_MIN_HEIGHT
  const composerY = canRenderBelow ? belowY : Math.max(PENDING_VIEWPORT_PADDING, aboveY)
  return { left: composerX, top: composerY, width: composerWidth }
}

