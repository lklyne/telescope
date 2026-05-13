import { describe, expect, it } from 'vitest'
import { CANVAS_MAX_ZOOM, CANVAS_MIN_ZOOM, clampCanvasZoom } from '../../src/shared/zoom'

describe('clampCanvasZoom', () => {
  it('passes values within range through unchanged', () => {
    expect(clampCanvasZoom(CANVAS_MIN_ZOOM)).toBe(CANVAS_MIN_ZOOM)
    expect(clampCanvasZoom(1)).toBe(1)
    expect(clampCanvasZoom(CANVAS_MAX_ZOOM)).toBe(CANVAS_MAX_ZOOM)
  })

  it('clamps values below the floor', () => {
    expect(clampCanvasZoom(CANVAS_MIN_ZOOM / 2)).toBe(CANVAS_MIN_ZOOM)
  })

  it('clamps values above the ceiling', () => {
    expect(clampCanvasZoom(CANVAS_MAX_ZOOM * 2)).toBe(CANVAS_MAX_ZOOM)
  })
})
