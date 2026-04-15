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
): { x: number; y: number; transform: string } | null {
  const railAnchor = (
    frame: LayoutUpdateData['entities'][number],
    preferredY: number,
  ): { x: number; y: number; transform: string } => {
    const y = Math.min(
      Math.max(preferredY, toOverlayY(layout, frame.screenY + 10)),
      toOverlayY(layout, frame.screenY + frame.screenHeight - 10),
    )
    const rightX = frame.screenX + frame.screenWidth + 12
    const leftX = frame.screenX - 12
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
  if (anchor.type === 'frame' || anchor.type === 'element') {
    const frame = layout.entities.find((f) => f.id === anchor.frameId)
    if (!frame) return null
    if (anchor.type === 'element' && anchor.boundingBox) {
      const topInset = 8
      const rightInset = 8
      const x =
        frame.screenX +
        (anchor.boundingBox.x + anchor.boundingBox.width) *
          (frame.screenWidth / frame.width) -
        rightInset
      const y =
        frame.screenY +
        anchor.boundingBox.y * (frame.screenHeight / frame.height) +
        topInset
      const clampedX = Math.max(
        frame.screenX + rightInset,
        Math.min(x, frame.screenX + frame.screenWidth - rightInset),
      )
      const clampedY = Math.max(
        frame.screenY + topInset,
        Math.min(y, frame.screenY + frame.screenHeight - topInset),
      )
      return {
        x: clampedX,
        y: toOverlayY(layout, clampedY),
        transform: 'translate(-100%, 0)',
      }
    }
    if (anchor.type === 'frame') {
      const y = toOverlayY(layout, frame.screenY + anchor.offsetY * frame.screenHeight)
      return railAnchor(frame, y)
    }
    return railAnchor(frame, toOverlayY(layout, frame.screenY + frame.screenHeight / 2))
  }
  return null
}

