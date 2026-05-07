import { describe, expect, it } from 'vitest'
import {
  CHROME_HEADER_HEIGHT,
  entityChromeSlots,
} from '../../src/shared/entity-chrome-slots'
import type { Rect } from '../../src/shared/hit-regions'
import type { CanvasEntityKind } from '../../src/shared/types'

const RECT: Rect = { x: 100, y: 200, width: 400, height: 300 }

describe('entityChromeSlots', () => {
  describe('kinds with header chrome', () => {
    const kinds: CanvasEntityKind[] = ['frame', 'file', 'group']
    for (const kind of kinds) {
      it(`${kind}: header sits atop entity rect, body fills the rest`, () => {
        const { body, slots } = entityChromeSlots(kind, RECT)
        expect(slots).toHaveLength(1)
        expect(slots[0]).toEqual({
          name: 'header',
          rect: {
            x: RECT.x,
            y: RECT.y,
            width: RECT.width,
            height: CHROME_HEADER_HEIGHT,
          },
        })
        expect(body).toEqual({
          x: RECT.x,
          y: RECT.y + CHROME_HEADER_HEIGHT,
          width: RECT.width,
          height: RECT.height - CHROME_HEADER_HEIGHT,
        })
      })
    }

    it('clamps header height when entity rect is shorter than chrome', () => {
      const tiny: Rect = { x: 0, y: 0, width: 100, height: 20 }
      const { body, slots } = entityChromeSlots('frame', tiny)
      expect(slots[0].rect.height).toBe(20)
      expect(body.height).toBe(0)
      expect(body.y).toBe(20)
    })
  })

  describe('kinds without chrome', () => {
    const kinds: CanvasEntityKind[] = ['text', 'shape', 'drawing']
    for (const kind of kinds) {
      it(`${kind}: body equals entity rect, no slots`, () => {
        const { body, slots } = entityChromeSlots(kind, RECT)
        expect(slots).toEqual([])
        expect(body).toEqual(RECT)
      })
    }
  })
})
