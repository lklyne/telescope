import { scaleEdgeAnchorHitSize } from '../../shared/canvas-hit-geometry'

/**
 * Edge hit targets are drawn in screen-space, so their 1x tuned sizes need to
 * shrink as the canvas zooms out or they start intercepting too much input.
 */
export function scaleEdgeHitTargetSize(basePx: number, zoom: number): number {
  return scaleEdgeAnchorHitSize(basePx, zoom)
}
