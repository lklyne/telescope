import { describe, expect, it } from 'vitest'
import {
  intersectRegionWithPage,
  pointerInPage,
} from '../../src/main/runtime/comment-hover-math'

const PAGE = { x: 100, y: 50, width: 400, height: 300 }

describe('intersectRegionWithPage', () => {
  it('returns the page-local rect for a region fully inside the page', () => {
    const result = intersectRegionWithPage(
      { x: 150, y: 80, width: 100, height: 60 },
      PAGE,
    )
    expect(result).toEqual({ x: 50, y: 30, width: 100, height: 60 })
  })

  it('clips a region that overflows the page edges', () => {
    const result = intersectRegionWithPage(
      { x: 50, y: 10, width: 500, height: 1000 },
      PAGE,
    )
    expect(result).toEqual({ x: 0, y: 0, width: 400, height: 300 })
  })

  it('returns null when the rects share an edge but do not overlap', () => {
    expect(
      intersectRegionWithPage({ x: 500, y: 50, width: 50, height: 50 }, PAGE),
    ).toBeNull()
  })

  it('returns null when the region misses entirely', () => {
    expect(
      intersectRegionWithPage({ x: 0, y: 0, width: 50, height: 50 }, PAGE),
    ).toBeNull()
  })

  it('returns null when the page has no area', () => {
    expect(
      intersectRegionWithPage(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 0, y: 0, width: 0, height: 100 },
      ),
    ).toBeNull()
  })
})

describe('pointerInPage', () => {
  it('returns the page-local point when the pointer is inside', () => {
    expect(pointerInPage(150, 80, PAGE)).toEqual({ x: 50, y: 30 })
  })

  it('returns null when the pointer falls outside any edge', () => {
    expect(pointerInPage(99, 80, PAGE)).toBeNull()
    expect(pointerInPage(150, 49, PAGE)).toBeNull()
    expect(pointerInPage(500, 80, PAGE)).toBeNull()
    expect(pointerInPage(150, 350, PAGE)).toBeNull()
  })

  it('treats the right/bottom edge as outside (matches half-open intersection)', () => {
    // Pointer flush against the right edge falls one px outside: 100+400 = 500.
    expect(pointerInPage(500, 80, PAGE)).toBeNull()
  })

  it('returns null when the page has no area', () => {
    expect(
      pointerInPage(10, 10, { x: 0, y: 0, width: 0, height: 100 }),
    ).toBeNull()
  })
})
