import type { PresenceTargetRect } from './types'

export function resolvePresencePagePoint(input: {
  pageX?: number | null
  pageY?: number | null
  targetRect?: PresenceTargetRect | null
  fallbackX: number
  fallbackY: number
}): { x: number; y: number } {
  const targetCenter = input.targetRect
    ? {
        x: input.targetRect.x + input.targetRect.width / 2,
        y: input.targetRect.y + input.targetRect.height / 2,
      }
    : null

  return {
    x:
      typeof input.pageX === 'number'
        ? input.pageX
        : targetCenter?.x ?? input.fallbackX,
    y:
      typeof input.pageY === 'number'
        ? input.pageY
        : targetCenter?.y ?? input.fallbackY,
  }
}

export function pagePointMatchesTargetRect(
  pageX: number | null | undefined,
  pageY: number | null | undefined,
  targetRect: PresenceTargetRect | null | undefined,
  tolerance = 2,
): boolean {
  if (!targetRect || typeof pageX !== 'number' || typeof pageY !== 'number') return true
  return (
    pageX >= targetRect.x - tolerance &&
    pageX <= targetRect.x + targetRect.width + tolerance &&
    pageY >= targetRect.y - tolerance &&
    pageY <= targetRect.y + targetRect.height + tolerance
  )
}
