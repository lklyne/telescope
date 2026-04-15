import { describe, it, expect } from 'vitest'
import {
  resolvePresenceFramePoint,
  framePointMatchesTargetRect,
} from '../../src/shared/presence-targeting'

describe('resolvePresenceFramePoint', () => {
  it('prefers explicit frame coordinates', () => {
    const result = resolvePresenceFramePoint({
      frameX: 100,
      frameY: 200,
      targetRect: { x: 10, y: 20, width: 50, height: 50 },
      fallbackX: 0,
      fallbackY: 0,
    })
    expect(result).toEqual({ x: 100, y: 200 })
  })

  it('falls back to target rect center when no frame coordinates', () => {
    const result = resolvePresenceFramePoint({
      frameX: null,
      frameY: null,
      targetRect: { x: 10, y: 20, width: 50, height: 60 },
      fallbackX: 0,
      fallbackY: 0,
    })
    expect(result).toEqual({ x: 35, y: 50 })
  })

  it('falls back to fallback coordinates when nothing else available', () => {
    const result = resolvePresenceFramePoint({
      frameX: null,
      frameY: null,
      targetRect: null,
      fallbackX: 500,
      fallbackY: 300,
    })
    expect(result).toEqual({ x: 500, y: 300 })
  })
})

describe('framePointMatchesTargetRect', () => {
  const rect = { x: 10, y: 20, width: 100, height: 50 }

  it('returns true when point is inside rect', () => {
    expect(framePointMatchesTargetRect(50, 40, rect)).toBe(true)
  })

  it('returns true at rect edges within tolerance', () => {
    expect(framePointMatchesTargetRect(10, 20, rect)).toBe(true)
    expect(framePointMatchesTargetRect(110, 70, rect)).toBe(true)
  })

  it('returns false when point is outside rect and tolerance', () => {
    expect(framePointMatchesTargetRect(5, 15, rect)).toBe(false)
    expect(framePointMatchesTargetRect(200, 200, rect)).toBe(false)
  })

  it('returns true when frameX or frameY is null', () => {
    expect(framePointMatchesTargetRect(null, 40, rect)).toBe(true)
    expect(framePointMatchesTargetRect(50, null, rect)).toBe(true)
  })

  it('returns true when targetRect is null', () => {
    expect(framePointMatchesTargetRect(50, 40, null)).toBe(true)
  })

  it('respects custom tolerance', () => {
    expect(framePointMatchesTargetRect(5, 20, rect, 10)).toBe(true)
    expect(framePointMatchesTargetRect(5, 20, rect, 1)).toBe(false)
  })
})
