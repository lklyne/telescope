import { describe, expect, it } from 'vitest'
import {
  CURSOR_MOTION_PRESETS,
  DEFAULT_CURSOR_MOTION,
  cubicBezierPoint,
  deriveControlPoints,
  easeAt,
  normalizeCursorMotion,
  sampleCursorPath,
} from '../../src/shared/cursor-motion'

describe('easeAt', () => {
  it('linear is identity', () => {
    expect(easeAt({ kind: 'preset', name: 'linear' }, 0.25)).toBeCloseTo(0.25)
    expect(easeAt({ kind: 'preset', name: 'linear' }, 0.75)).toBeCloseTo(0.75)
  })

  it('preset easings pin endpoints', () => {
    for (const name of Object.keys(CURSOR_MOTION_PRESETS) as Array<
      keyof typeof CURSOR_MOTION_PRESETS
    >) {
      expect(easeAt({ kind: 'preset', name }, 0)).toBe(0)
      expect(easeAt({ kind: 'preset', name }, 1)).toBe(1)
    }
  })

  it('easeInOutCubic is monotonic over [0,1]', () => {
    let prev = 0
    for (let i = 1; i <= 10; i++) {
      const t = i / 10
      const v = easeAt({ kind: 'preset', name: 'easeInOutCubic' }, t)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it('custom bezier matches an ease-out shape', () => {
    const v = easeAt({ kind: 'custom', x1: 0, y1: 0, x2: 0.58, y2: 1 }, 0.5)
    expect(v).toBeGreaterThan(0.5)
  })
})

describe('cubicBezierPoint', () => {
  it('maps endpoints to p0 and p3', () => {
    const p0 = { x: 10, y: 20 }
    const p1 = { x: 50, y: -30 }
    const p2 = { x: 70, y: 120 }
    const p3 = { x: 200, y: 80 }
    expect(cubicBezierPoint(p0, p1, p2, p3, 0)).toEqual(p0)
    expect(cubicBezierPoint(p0, p1, p2, p3, 1)).toEqual(p3)
  })
})

describe('deriveControlPoints', () => {
  const p0 = { x: 0, y: 0 }
  const p3 = { x: 100, y: 0 }

  it('curveStrength=0 places controls on the straight line', () => {
    const { p1, p2 } = deriveControlPoints(
      p0,
      p3,
      {
        ...DEFAULT_CURSOR_MOTION,
        curveStrength: 0,
        curveAsymmetry: 0,
        curveJitter: 0,
      },
      0,
    )
    expect(p1.y).toBeCloseTo(0)
    expect(p2.y).toBeCloseTo(0)
  })

  it('left and right produce mirrored offsets', () => {
    const left = deriveControlPoints(
      p0,
      p3,
      {
        ...DEFAULT_CURSOR_MOTION,
        curveStrength: 0.5,
        curveJitter: 0,
        curveDirection: 'left',
      },
      0,
    )
    const right = deriveControlPoints(
      p0,
      p3,
      {
        ...DEFAULT_CURSOR_MOTION,
        curveStrength: 0.5,
        curveJitter: 0,
        curveDirection: 'right',
      },
      0,
    )
    expect(Math.sign(left.p1.y)).not.toBe(Math.sign(right.p1.y))
    expect(left.p1.y).toBeCloseTo(-right.p1.y)
  })

  it('zero-distance returns endpoints unchanged', () => {
    const { p1, p2 } = deriveControlPoints(
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      DEFAULT_CURSOR_MOTION,
      0,
    )
    expect(p1).toEqual({ x: 5, y: 5 })
    expect(p2).toEqual({ x: 5, y: 5 })
  })
})

describe('sampleCursorPath', () => {
  it('endpoints match p0 and p3', () => {
    const p0 = { x: 0, y: 0 }
    const p3 = { x: 100, y: 50 }
    const params = {
      ...DEFAULT_CURSOR_MOTION,
      curveStrength: 0.8,
      curveAsymmetry: 0.5,
      curveDirection: 'right' as const,
    }
    const start = sampleCursorPath(p0, p3, params, 0, 0)
    const end = sampleCursorPath(p0, p3, params, 0, 1)
    expect(start.x).toBeCloseTo(p0.x)
    expect(start.y).toBeCloseTo(p0.y)
    expect(end.x).toBeCloseTo(p3.x)
    expect(end.y).toBeCloseTo(p3.y)
  })
})

describe('normalizeCursorMotion', () => {
  it('empty object returns defaults', () => {
    expect(normalizeCursorMotion({})).toEqual(DEFAULT_CURSOR_MOTION)
  })

  it('undefined and non-objects return defaults', () => {
    expect(normalizeCursorMotion(undefined)).toEqual(DEFAULT_CURSOR_MOTION)
    expect(normalizeCursorMotion(null)).toEqual(DEFAULT_CURSOR_MOTION)
    expect(normalizeCursorMotion(42)).toEqual(DEFAULT_CURSOR_MOTION)
  })

  it('clamps out-of-range values', () => {
    const n = normalizeCursorMotion({
      durationMs: 99999,
      curveStrength: 5,
      curveAsymmetry: -10,
    })
    expect(n.durationMs).toBe(2000)
    expect(n.curveStrength).toBe(1)
    expect(n.curveAsymmetry).toBe(-1)
  })

  it('accepts custom easing', () => {
    const n = normalizeCursorMotion({
      easing: { kind: 'custom', x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
    })
    expect(n.easing.kind).toBe('custom')
    if (n.easing.kind === 'custom') {
      expect(n.easing.x1).toBeCloseTo(0.25)
      expect(n.easing.x2).toBeCloseTo(0.25)
    }
  })
})
