/**
 * Hit-test layer priority. Top wins.
 *
 * See docs/adr/0001-click-to-enter-page-focus.md for the load-bearing
 * constraints encoded here:
 *   - Resize handles above chrome: once selected, the next gesture is shaping.
 *   - Chrome above anchors: fixes #41 (anchor ring shadowing chrome).
 *   - Body kind-dispatches: same priority slot, behavior chosen by kind.
 */

export type HitLayer =
  | 'resize-handles'
  | 'chrome'
  | 'anchors'
  | 'body'
  | 'background'

export const HIT_LAYER_ORDER: readonly HitLayer[] = [
  'resize-handles',
  'chrome',
  'anchors',
  'body',
  'background',
] as const

export function compareLayers(a: HitLayer, b: HitLayer): number {
  return HIT_LAYER_ORDER.indexOf(a) - HIT_LAYER_ORDER.indexOf(b)
}
