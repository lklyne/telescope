import { GRID_SIZE } from '../../shared/constants'

function snapToDevicePixel(value: number, devicePixelRatio: number) {
  const step = 1 / Math.max(devicePixelRatio, 1)
  return Math.max(step, Math.round(value / step) * step)
}

function normalizeOffset(offset: number, spacing: number) {
  return ((offset % spacing) + spacing) % spacing
}

export function buildCanvasGridStyle({
  canvasOrigin,
  pan,
  zoom,
  isDark,
  devicePixelRatio,
}: {
  canvasOrigin: { x: number; y: number }
  pan: { x: number; y: number }
  zoom: number
  isDark: boolean
  devicePixelRatio: number
}) {
  const spacing = snapToDevicePixel(GRID_SIZE * zoom, devicePixelRatio)
  const offsetX = normalizeOffset(canvasOrigin.x + pan.x, spacing)
  const offsetY = normalizeOffset(canvasOrigin.y + pan.y, spacing)

  return {
    backgroundColor: 'var(--surface-canvas)',
    backgroundImage: 'radial-gradient(circle, var(--surface-canvas-grid) 0.75px, transparent 0.75px)',
    backgroundSize: `${spacing}px ${spacing}px`,
    backgroundPosition: `${offsetX}px ${offsetY}px`,
  }
}
