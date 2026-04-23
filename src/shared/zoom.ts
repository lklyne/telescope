export const CANVAS_MIN_ZOOM = 0.02
export const CANVAS_MAX_ZOOM = 3.0

export function clampCanvasZoom(value: number): number {
  return Math.max(CANVAS_MIN_ZOOM, Math.min(CANVAS_MAX_ZOOM, value))
}
