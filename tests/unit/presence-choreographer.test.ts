import { describe, expect, it } from 'vitest'
import { createPresenceChoreographer } from '../../src/shared/presence-choreographer'
import {
  DEFAULT_PRESENCE_CHOREOGRAPHY_MODES,
  DEFAULT_PRESENCE_VISUAL_STATES,
  type ChoreographyTransitionTable,
} from '../../src/shared/presence-choreography-config'
import type { PresenceChoreographyInput } from '../../src/shared/presence-visual-state'

const TRANSITIONS: ChoreographyTransitionTable = {
  default: {
    durationMs: 200,
    strategy: 'crossfade',
    exitEffect: 'fade',
    easing: 'linear',
  },
  edges: {
    'inspecting->inspecting': {
      durationMs: 200,
      strategy: 'direct-morph',
      exitEffect: 'none',
      easing: 'linear',
    },
  },
}

function input(
  overrides: Partial<PresenceChoreographyInput> = {},
): PresenceChoreographyInput {
  return {
    cursorId: 'c1',
    x: 100,
    y: 100,
    color: '#000',
    visualState: 'moving',
    targetRect: null,
    isMoving: true,
    ...overrides,
  }
}

describe('createPresenceChoreographer', () => {
  it('emits a semantic idle sphere without transition scaffolding', () => {
    const choreographer = createPresenceChoreographer({
      modes: DEFAULT_PRESENCE_CHOREOGRAPHY_MODES,
      transitions: TRANSITIONS,
      visualStates: DEFAULT_PRESENCE_VISUAL_STATES,
    })

    const frame = choreographer.update([
      input({ visualState: 'idle', isMoving: false }),
    ], 16)

    expect(frame.layers).toHaveLength(1)
    expect(frame.layers[0]).toMatchObject({
      layerId: 'c1',
      formation: 'orbit_sphere',
      visualState: 'idle',
      transitionProgress: 1,
    })
  })

  it('crossfades between semantic states without exposing colon-suffixed ids', () => {
    const choreographer = createPresenceChoreographer({
      modes: DEFAULT_PRESENCE_CHOREOGRAPHY_MODES,
      transitions: TRANSITIONS,
      visualStates: DEFAULT_PRESENCE_VISUAL_STATES,
    })
    choreographer.update([input({ visualState: 'idle', isMoving: false })], 16)

    const frame = choreographer.update([input({ visualState: 'moving' })], 100)

    expect(frame.layers).toHaveLength(2)
    expect(frame.layers.map((layer) => layer.layerId).sort()).toEqual([
      'c1/arriving',
      'c1/leaving',
    ])
    expect(frame.layers.every((layer) => !layer.layerId.includes(':'))).toBe(true)
    const arriving = frame.layers.find((layer) => layer.layerId === 'c1/arriving')!
    expect(arriving.formation).toBe('trail')
    expect(arriving.intensity).toBeCloseTo(
      DEFAULT_PRESENCE_CHOREOGRAPHY_MODES.trail.baseIntensity * 0.5,
      5,
    )
  })

  it('uses direct morph for rect-to-rect target changes', () => {
    const choreographer = createPresenceChoreographer({
      modes: DEFAULT_PRESENCE_CHOREOGRAPHY_MODES,
      transitions: TRANSITIONS,
      visualStates: DEFAULT_PRESENCE_VISUAL_STATES,
    })
    choreographer.update(
      [
        input({
          visualState: 'inspecting',
          isMoving: false,
          targetRect: { x: 0, y: 0, width: 50, height: 50 },
        }),
      ],
      16,
    )

    const frame = choreographer.update(
      [
        input({
          visualState: 'inspecting',
          isMoving: false,
          targetRect: { x: 10, y: 20, width: 80, height: 90 },
        }),
      ],
      100,
    )

    expect(frame.layers).toHaveLength(1)
    expect(frame.layers[0]).toMatchObject({
      layerId: 'c1',
      formation: 'orbit_rect',
      transitionStrategy: 'direct-morph',
    })
  })

  it('turns click events into one-shot burst events', () => {
    const choreographer = createPresenceChoreographer({
      modes: DEFAULT_PRESENCE_CHOREOGRAPHY_MODES,
      transitions: TRANSITIONS,
      visualStates: DEFAULT_PRESENCE_VISUAL_STATES,
    })
    const frame = choreographer.update(
      [
        input({
          visualState: 'idle',
          isMoving: false,
          events: [{ type: 'click', at: { x: 10, y: 20 } }],
        }),
      ],
      16,
    )

    expect(frame.events).toEqual([
      { type: 'burst', layerId: 'c1', at: { x: 10, y: 20 } },
    ])
  })

  it('global burst strategy override emits a transition burst', () => {
    const choreographer = createPresenceChoreographer({
      modes: DEFAULT_PRESENCE_CHOREOGRAPHY_MODES,
      transitions: {
        ...TRANSITIONS,
        overrideStrategy: 'burst',
      },
      visualStates: DEFAULT_PRESENCE_VISUAL_STATES,
    })
    choreographer.update([input({ visualState: 'idle', isMoving: false })], 16)

    const frame = choreographer.update([input({ visualState: 'moving' })], 50)

    expect(frame.events).toEqual([
      { type: 'burst', layerId: 'c1', at: { x: 100, y: 100 } },
    ])
  })
})
