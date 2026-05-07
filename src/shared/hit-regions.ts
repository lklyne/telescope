/**
 * HitRegion ADT — pure, screen-space hit geometry.
 *
 * Used by the main-process hit-tester to classify pointer events arriving
 * from `aboveView`. All coordinates are screen-space (the same space
 * pointer events are reported in).
 *
 * Pure: no React, no Electron, no DOM. The interface is the test surface.
 */

export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; width: number; height: number }

export type HitRegion =
  | { kind: 'rect'; rect: Rect }
  | { kind: 'disc'; cx: number; cy: number; radius: number }
  | { kind: 'stroke'; from: Point; to: Point; thickness: number }

export function regionContains(region: HitRegion, p: Point): boolean {
  switch (region.kind) {
    case 'rect':
      return rectContains(region.rect, p)
    case 'disc':
      return distanceSq(p.x, p.y, region.cx, region.cy) <= region.radius * region.radius
    case 'stroke':
      return strokeContains(region.from, region.to, region.thickness, p)
  }
}

export function rectContains(rect: Rect, p: Point): boolean {
  return (
    p.x >= rect.x &&
    p.x <= rect.x + rect.width &&
    p.y >= rect.y &&
    p.y <= rect.y + rect.height
  )
}

function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

function strokeContains(a: Point, b: Point, thickness: number, p: Point): boolean {
  const lengthSq = distanceSq(a.x, a.y, b.x, b.y)
  if (lengthSq === 0) {
    return distanceSq(p.x, p.y, a.x, a.y) <= (thickness / 2) * (thickness / 2)
  }
  // Project p onto the segment, clamped to [0,1].
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / lengthSq),
  )
  const projX = a.x + t * (b.x - a.x)
  const projY = a.y + t * (b.y - a.y)
  const half = thickness / 2
  return distanceSq(p.x, p.y, projX, projY) <= half * half
}

export function inflateRect(rect: Rect, dx: number, dy: number): Rect {
  return {
    x: rect.x - dx,
    y: rect.y - dy,
    width: rect.width + dx * 2,
    height: rect.height + dy * 2,
  }
}
