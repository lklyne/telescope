import { describe, expect, it } from 'vitest'
import { CANVAS_MAX_ZOOM, CANVAS_MIN_ZOOM, clampCanvasZoom } from '../../src/shared/zoom'

describe('canvas zoom bounds', () => {
  it('allows zooming out to 2%', () => {
    expect(CANVAS_MIN_ZOOM).toBe(0.02)
    expect(clampCanvasZoom(0.02)).toBe(0.02)
  })

  it('clamps below the supported zoom floor', () => {
    expect(clampCanvasZoom(0.01)).toBe(CANVAS_MIN_ZOOM)
  })

  it('preserves the existing zoom-in ceiling', () => {
    expect(clampCanvasZoom(4)).toBe(CANVAS_MAX_ZOOM)
  })
})
