const EDGE_HIT_TARGET_MIN_SCALE = 0.35

/**
 * Edge hit targets are drawn in screen-space, so their 1x tuned sizes need to
 * shrink as the canvas zooms out or they start intercepting too much input.
 */
export function scaleEdgeHitTargetSize(basePx: number, zoom: number): number {
  const scale = Math.max(EDGE_HIT_TARGET_MIN_SCALE, Math.min(zoom, 1))
  return basePx * scale
}
