export type AxisLockPoint = {
  x: number
  y: number
}

export type AxisLockAxis = 'horizontal' | 'vertical'

export function axisLockDominantAxis(
  cursorOffsetFromOrigin: AxisLockPoint,
  shiftKey: boolean,
): AxisLockAxis | null {
  if (!shiftKey) return null
  return Math.abs(cursorOffsetFromOrigin.x) >= Math.abs(cursorOffsetFromOrigin.y)
    ? 'horizontal'
    : 'vertical'
}

export function axisLockProjector(
  rawDelta: AxisLockPoint,
  cursorOffsetFromOrigin: AxisLockPoint,
  shiftKey: boolean,
): AxisLockPoint {
  const axis = axisLockDominantAxis(cursorOffsetFromOrigin, shiftKey)
  if (axis === null) return { ...rawDelta }
  if (axis === 'horizontal') return { x: rawDelta.x, y: 0 }
  return { x: 0, y: rawDelta.y }
}
