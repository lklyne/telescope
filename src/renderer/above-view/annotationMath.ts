import type {
  Annotation,
  AnnotationCreateRequest,
  AnnotationDrawing,
  AnnotationDrawingPoint,
  AnnotationDrawingStroke,
  LayoutUpdateData,
} from '../../shared/types'
import {
  canvasToScreenX,
  canvasToScreenY,
  toOverlayY,
} from '../../shared/gesture-utils'


export interface PendingAnnotation {
  request: AnnotationCreateRequest
  composerX: number
  composerY: number
  composerWidth: number
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

export function drawingBounds(
  strokes: AnnotationDrawingStroke[],
): AnnotationDrawing['bounds'] {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const stroke of strokes) {
    // Inflate each stroke by half its width so the bounding rect matches the
    // visible band (otherwise a straight horizontal/vertical line collapses
    // to a 1px-tall bbox and becomes impossible to drag).
    const pad = stroke.width / 2
    for (const point of stroke.points) {
      if (point.x - pad < left) left = point.x - pad
      if (point.y - pad < top) top = point.y - pad
      if (point.x + pad > right) right = point.x + pad
      if (point.y + pad > bottom) bottom = point.y + pad
    }
  }
  if (!Number.isFinite(left)) {
    return { x: 0, y: 0, width: 1, height: 1 }
  }
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
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
      const x =
        page.screenX +
        (anchor.boundingBox.x + anchor.boundingBox.width) *
          (page.screenWidth / page.width) -
        rightInset
      const y =
        page.screenY +
        anchor.boundingBox.y * (page.screenHeight / page.height) +
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

