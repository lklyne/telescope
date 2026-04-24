import { describe, it, expect } from 'vitest'
import { createPresenceEmitterMachine } from '../../src/shared/presence-emitter-machine'
import type {
  MachineCursorInput,
  EmitterModes,
  TransitionTable,
} from '../../src/shared/presence-emitter-machine'

const MODES: EmitterModes = {
  trail: {
    lifetimeSeconds: 2.5,
    emitsPerFrame: 16,
    emitSpeedReferencePxPerSec: 1250,
    emitSpeedBias: 2.35,
    driftStrength: 30,
    driftReferenceDistance: 180,
    driftTurnRate: 0.7,
    driftFlowScale: 0.001,
    holdSeconds: 0.3,
    fadeOutGraceSeconds: 0.2,
    fadeOutSeconds: 1.2,
    fadeOutEasing: 'ease-in',
    baseIntensity: 1.0,
  },
  orbit_sphere: {
    radiusPx: 8,
    angularVelocityRadPerSec: 0.6,
    radiusFadeInSeconds: 0.35,
    baseIntensity: 0.15,
  },
  orbit_rect: {
    crossJitterPx: 5,
    angularVelocityRadPerSec: 0.6,
    fadeInSeconds: 0.35,
    baseIntensity: 0.12,
  },
  burst: {
    speedPxPerSec: 360,
    speedJitter: 0.25,
    lifetimeSeconds: 0.7,
    dragPerSecond: 1.8,
  },
}

const TRANSITIONS: TransitionTable = {
  default: { durationMs: 250, exitEffect: 'fade', easing: 'ease-in-out' },
}

function input(overrides: Partial<MachineCursorInput> = {}): MachineCursorInput {
  return {
    cursorId: 'c1',
    x: 100,
    y: 100,
    color: '#000',
    desiredMode: 'trail',
    targetRect: null,
    isMoving: true,
    ...overrides,
  }
}

describe('createPresenceEmitterMachine — stable state', () => {
  it('emits one output per cursor at baseIntensity when desiredMode is stable', () => {
    const machine = createPresenceEmitterMachine({
      modes: MODES,
      transitions: TRANSITIONS,
    })
    const out = machine.update([input()], 16)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'c1',
      mode: 'trail',
      intensity: MODES.trail.baseIntensity,
      targetRect: null,
    })
  })

  it('emits one output per cursor across multiple cursors', () => {
    const machine = createPresenceEmitterMachine({
      modes: MODES,
      transitions: TRANSITIONS,
    })
    const out = machine.update(
      [input({ cursorId: 'a' }), input({ cursorId: 'b', desiredMode: 'orbit_sphere', isMoving: false })],
      16,
    )
    expect(out.map((o) => o.id).sort()).toEqual(['a', 'b'])
    const b = out.find((o) => o.id === 'b')!
    expect(b.mode).toBe('orbit_sphere')
    expect(b.intensity).toBe(MODES.orbit_sphere.baseIntensity)
  })

  it('drops cursors that disappear between ticks', () => {
    const machine = createPresenceEmitterMachine({
      modes: MODES,
      transitions: TRANSITIONS,
    })
    machine.update([input({ cursorId: 'a' })], 16)
    const out = machine.update([], 16)
    expect(out).toHaveLength(0)
  })
})

describe('createPresenceEmitterMachine — transitions', () => {
  function setup() {
    const machine = createPresenceEmitterMachine({
      modes: MODES,
      transitions: { default: { durationMs: 200, exitEffect: 'fade', easing: 'linear' } },
    })
    machine.update([input({ desiredMode: 'trail' })], 16)
    return machine
  }

  it('starts a transition when desiredMode changes', () => {
    const machine = setup()
    // Change desiredMode; advance one tick of 100ms — halfway through 200ms window.
    const out = machine.update([input({ desiredMode: 'orbit_sphere', isMoving: false })], 100)
    expect(out).toHaveLength(2)
    const outLayer = out.find((o) => o.id === 'c1:out')!
    const inLayer = out.find((o) => o.id === 'c1:in')!
    expect(outLayer.mode).toBe('trail')
    expect(inLayer.mode).toBe('orbit_sphere')
    expect(outLayer.intensity).toBeCloseTo(MODES.trail.baseIntensity * 0.5, 5)
    expect(inLayer.intensity).toBeCloseTo(MODES.orbit_sphere.baseIntensity * 0.5, 5)
  })

  it('collapses transition on or after duration', () => {
    const machine = setup()
    machine.update([input({ desiredMode: 'orbit_sphere', isMoving: false })], 100)
    const out = machine.update([input({ desiredMode: 'orbit_sphere', isMoving: false })], 200)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'c1',
      mode: 'orbit_sphere',
      intensity: MODES.orbit_sphere.baseIntensity,
    })
  })

  it('passes targetRect through to the incoming layer during transition', () => {
    const machine = setup()
    const rect = { x: 10, y: 20, width: 30, height: 40 }
    const out = machine.update(
      [input({ desiredMode: 'orbit_rect', isMoving: false, targetRect: rect })],
      50,
    )
    const inLayer = out.find((o) => o.id === 'c1:in')!
    expect(inLayer.mode).toBe('orbit_rect')
    expect(inLayer.targetRect).toEqual(rect)
  })

  it('honors per-edge transition config when provided', () => {
    const machine = createPresenceEmitterMachine({
      modes: MODES,
      transitions: {
        default: { durationMs: 1000, exitEffect: 'fade', easing: 'linear' },
        edges: { 'trail->orbit_sphere': { durationMs: 100, exitEffect: 'fade', easing: 'linear' } },
      },
    })
    machine.update([input({ desiredMode: 'trail' })], 16)
    // Advance 100ms — should complete the short trail→orbit_sphere edge.
    const out = machine.update([input({ desiredMode: 'orbit_sphere', isMoving: false })], 100)
    expect(out).toHaveLength(1)
    expect(out[0].mode).toBe('orbit_sphere')
  })
})
