import type { PresenceTargetRect } from './types'

export function resolvePresenceFramePoint(input: {
  frameX?: number | null
  frameY?: number | null
  targetRect?: PresenceTargetRect | null
  fallbackX: number
  fallbackY: number
}): { x: number; y: number } {
  if (typeof input.frameX === 'number' && typeof input.frameY === 'number') {
    return { x: input.frameX, y: input.frameY }
  }
  if (input.targetRect) {
    return {
      x: input.targetRect.x + input.targetRect.width / 2,
      y: input.targetRect.y + input.targetRect.height / 2,
    }
  }
  return { x: input.fallbackX, y: input.fallbackY }
}

export function framePointMatchesTargetRect(
  frameX: number | null | undefined,
  frameY: number | null | undefined,
  targetRect: PresenceTargetRect | null | undefined,
  tolerance = 2,
): boolean {
  if (!targetRect || typeof frameX !== 'number' || typeof frameY !== 'number') return true
  return (
    frameX >= targetRect.x - tolerance &&
    frameX <= targetRect.x + targetRect.width + tolerance &&
    frameY >= targetRect.y - tolerance &&
    frameY <= targetRect.y + targetRect.height + tolerance
  )
}
