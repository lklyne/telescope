# Presence Emitter State Machine — Implementation Plan

> **Status: Superseded.** This plan was replaced on 2026-04-25 by
> `docs/superpowers/plans/2026-04-25-presence-choreography-refactor.md`.
> The emitter-machine modules and tests described here have been removed; the
> canonical implementation is now the semantic choreography controller in
> `src/shared/presence-choreographer.ts` with renderer glue in
> `src/renderer/shared/usePresenceChoreography.ts`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current instant activity-to-mode mapping with a pure state machine that owns mode transitions (trail ↔ orbit_sphere ↔ orbit_rect) via crossfade + burst punctuation, driven by a pluggable auto-mode policy that reads from live cursor state (moving / stationary / over-rect).

**Architecture:** Pure state machine + config + policy live in `src/shared/` (unit-testable, no Electron/WebGPU). A React hook in `src/renderer/shared/` is the RAF-tick glue. `PresenceParticleTrail` gains per-mode param props (orbit and burst tunings currently hardcoded). `AgentCursorLayer` and `PresencePlayground` both stop picking modes directly and instead feed the hook.

**Tech Stack:** TypeScript, React, Vitest, WebGPU (existing particle system), Yjs (not touched).

**Design doc:** `docs/superpowers/specs/2026-04-24-presence-emitter-state-machine-design.md`

---

## File Structure

**New files:**
- `src/shared/presence-emitter-machine.ts` — pure machine + machine-local types (EmitterMode, TrailParams, OrbitSphereParams, OrbitRectParams, BurstParams, EmitterModes, TransitionConfig, TransitionTable, MachineCursorInput, MachineCursorOutput, PresenceEmitterMachine, createPresenceEmitterMachine). One responsibility: transition state + output generation.
- `src/shared/presence-emitter-config.ts` — DEFAULT_EMITTER_MODES + DEFAULT_TRANSITION_TABLE constants. One responsibility: preserving today's visual defaults in one place.
- `src/shared/presence-emitter-policy.ts` — AutoModePolicy type + defaultAutoPolicy. One responsibility: mapping raw signals to desiredMode.
- `src/renderer/shared/usePresenceEmitter.ts` — React hook: owns machine instance, RAF tick, per-cursor movement tracking, exposes controls. One responsibility: React glue around the pure machine.
- `tests/unit/presence-emitter-machine.test.ts` — machine transition tests.
- `tests/unit/presence-emitter-policy.test.ts` — policy tests (ports existing emitterModeForPresenceCursor tests).

**Modified files:**
- `src/renderer/shared/PresenceParticleTrail.tsx` — new optional props for orbit_sphere, orbit_rect, and burst tunings. Existing constants become prop defaults.
- `src/renderer/canvas-bg/AgentCursorLayer.tsx` — replace `emitterModeForPresenceCursor` + direct particle controls with `usePresenceEmitter`.
- `src/renderer/debug/PresencePlayground.tsx` — always-visible demo rect, `auto` option in mode selector, machine-driven emitter.

**Removed files:**
- `tests/unit/agent-presence-emitter.test.ts` — superseded by `tests/unit/presence-emitter-policy.test.ts`.

**Pruned exports in `src/shared/agent-presence.ts`:**
- Remove `emitterModeForPresenceCursor` + `PresenceEmitterMode` type alias.

---

## Task 1: Policy module + tests

**Files:**
- Create: `src/shared/presence-emitter-policy.ts`
- Create: `tests/unit/presence-emitter-policy.test.ts`

The policy maps `{isMoving, targetRect, activity, labelKey}` to an `EmitterMode`. Movement overrides activity. Adding `isMoving` check as the first rule makes "moving → trail" true even when activity is `thinking`/`waiting`.

Since `EmitterMode` is also needed by the machine (Task 2), the type lives in the machine file. For Task 1, we forward-declare a union literal locally and clean up the duplication when the machine module lands.

- [ ] **Step 1: Write the failing test**

`tests/unit/presence-emitter-policy.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { defaultAutoPolicy } from '../../src/shared/presence-emitter-policy'
import type { PresenceActivity, PresenceLabelKey } from '../../src/shared/types'

describe('defaultAutoPolicy.pick', () => {
  const DEMO_RECT = { x: 0, y: 0, width: 100, height: 100 }

  const activityCases: Array<{
    activity: PresenceActivity
    labelKey: PresenceLabelKey | null
    targetRect: typeof DEMO_RECT | null
    expected: 'trail' | 'orbit_sphere' | 'orbit_rect'
    name: string
  }> = [
    { name: 'traveling stationary → trail', activity: 'traveling', labelKey: null, targetRect: null, expected: 'trail' },
    { name: 'acting+click_target stationary → trail', activity: 'acting', labelKey: 'click_target', targetRect: null, expected: 'trail' },
    { name: 'idle stationary → trail', activity: 'idle', labelKey: null, targetRect: null, expected: 'trail' },
    { name: 'departing stationary → trail', activity: 'departing', labelKey: null, targetRect: null, expected: 'trail' },
    { name: 'thinking stationary → orbit_sphere', activity: 'thinking', labelKey: 'thinking', targetRect: null, expected: 'orbit_sphere' },
    { name: 'waiting stationary → orbit_sphere', activity: 'waiting', labelKey: null, targetRect: null, expected: 'orbit_sphere' },
    { name: 'acting+inspect_page with rect → orbit_rect', activity: 'acting', labelKey: 'inspect_page', targetRect: DEMO_RECT, expected: 'orbit_rect' },
    { name: 'acting+inspect_page without rect → orbit_sphere', activity: 'acting', labelKey: 'inspect_page', targetRect: null, expected: 'orbit_sphere' },
  ]

  for (const { name, activity, labelKey, targetRect, expected } of activityCases) {
    it(name, () => {
      expect(
        defaultAutoPolicy.pick({ isMoving: false, activity, labelKey, targetRect }),
      ).toBe(expected)
    })
  }

  it('moving overrides thinking → trail', () => {
    expect(
      defaultAutoPolicy.pick({
        isMoving: true,
        activity: 'thinking',
        labelKey: 'thinking',
        targetRect: null,
      }),
    ).toBe('trail')
  })

  it('moving overrides acting+inspect_page → trail', () => {
    expect(
      defaultAutoPolicy.pick({
        isMoving: true,
        activity: 'acting',
        labelKey: 'inspect_page',
        targetRect: DEMO_RECT,
      }),
    ).toBe('trail')
  })

  it('policy works without activity/labelKey (playground path)', () => {
    expect(defaultAutoPolicy.pick({ isMoving: true, targetRect: null })).toBe('trail')
    expect(defaultAutoPolicy.pick({ isMoving: false, targetRect: null })).toBe('orbit_sphere')
    expect(defaultAutoPolicy.pick({ isMoving: false, targetRect: DEMO_RECT })).toBe(
      'orbit_rect',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- presence-emitter-policy`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the policy module**

`src/shared/presence-emitter-policy.ts`:

```ts
import type { PresenceActivity, PresenceLabelKey } from './types'

export type EmitterMode = 'trail' | 'orbit_sphere' | 'orbit_rect'

export interface PresenceEmitterRect {
  x: number
  y: number
  width: number
  height: number
}

export interface AutoModePolicyInput {
  isMoving: boolean
  targetRect: PresenceEmitterRect | null
  activity?: PresenceActivity
  labelKey?: PresenceLabelKey | null
}

export interface AutoModePolicy {
  pick(input: AutoModePolicyInput): EmitterMode
}

// Moving always wins over activity. When stationary, orbit_rect requires both
// the "inspecting" signal and a resolved rect — without the rect we fall back
// to orbit_sphere. The playground path omits activity/labelKey entirely and
// still gets sensible mapping from (isMoving, targetRect).
export const defaultAutoPolicy: AutoModePolicy = {
  pick: ({ isMoving, targetRect, activity, labelKey }) => {
    if (isMoving) return 'trail'
    if (targetRect) {
      if (activity === undefined || (activity === 'acting' && labelKey === 'inspect_page')) {
        return 'orbit_rect'
      }
    }
    if (activity === 'thinking' || activity === 'waiting') return 'orbit_sphere'
    if (activity === undefined) return 'orbit_sphere' // playground stationary default
    return 'trail'
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- presence-emitter-policy`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/presence-emitter-policy.ts tests/unit/presence-emitter-policy.test.ts
git commit -m "$(cat <<'EOF'
feat(presence): auto-mode policy module

Pure mapping from (isMoving, targetRect, activity?, labelKey?) to an
emitter mode. Movement overrides activity so stationary-only states
(thinking/waiting → orbit_sphere, inspecting → orbit_rect) defer to
trail while the cursor is in motion. Supersedes the direct activity
mapping in agent-presence.ts (cleanup in a later task).
EOF
)"
```

---

## Task 2: Machine module — types + stable-state update

**Files:**
- Create: `src/shared/presence-emitter-machine.ts`
- Create: `tests/unit/presence-emitter-machine.test.ts`

Implement the pure machine. This task only handles stable state: one output per cursor with `intensity = modes[currentMode].baseIntensity`. Transitions follow in Task 3.

- [ ] **Step 1: Write the failing test**

`tests/unit/presence-emitter-machine.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- presence-emitter-machine`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the machine module**

`src/shared/presence-emitter-machine.ts`:

```ts
import type { EmitterMode, PresenceEmitterRect } from './presence-emitter-policy'

export type { EmitterMode, PresenceEmitterRect } from './presence-emitter-policy'

export type FadeEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'

export interface TrailParams {
  lifetimeSeconds: number
  emitsPerFrame: number
  emitSpeedReferencePxPerSec: number
  emitSpeedBias: number
  driftStrength: number
  driftReferenceDistance: number
  driftTurnRate: number
  driftFlowScale: number
  holdSeconds: number
  fadeOutGraceSeconds: number
  fadeOutSeconds: number
  fadeOutEasing: FadeEasing
  baseIntensity: number
}

export interface OrbitSphereParams {
  radiusPx: number
  angularVelocityRadPerSec: number
  radiusFadeInSeconds: number
  baseIntensity: number
}

export interface OrbitRectParams {
  crossJitterPx: number
  angularVelocityRadPerSec: number
  fadeInSeconds: number
  baseIntensity: number
}

export interface BurstParams {
  speedPxPerSec: number
  speedJitter: number
  lifetimeSeconds: number
  dragPerSecond: number
}

export interface EmitterModes {
  trail: TrailParams
  orbit_sphere: OrbitSphereParams
  orbit_rect: OrbitRectParams
  burst: BurstParams
}

export interface TransitionConfig {
  durationMs: number
  exitEffect: 'fade' | 'burst' | 'none'
  easing: FadeEasing
}

export type TransitionEdgeKey = `${EmitterMode}->${EmitterMode}`

export interface TransitionTable {
  default: TransitionConfig
  edges?: Partial<Record<TransitionEdgeKey, TransitionConfig>>
}

export interface MachineCursorInput {
  cursorId: string
  x: number
  y: number
  color: string
  desiredMode: EmitterMode
  targetRect: PresenceEmitterRect | null
  isMoving: boolean
}

export interface MachineCursorOutput {
  id: string
  x: number
  y: number
  color: string
  mode: EmitterMode
  intensity: number
  targetRect: PresenceEmitterRect | null
}

export interface PresenceEmitterMachine {
  update(inputs: MachineCursorInput[], dtMs: number): MachineCursorOutput[]
  triggerBurst(cursorId: string): void
}

export interface CreateMachineOptions {
  modes: EmitterModes
  transitions: TransitionTable
}

interface CursorState {
  currentMode: EmitterMode
}

function baseIntensity(modes: EmitterModes, mode: EmitterMode): number {
  return modes[mode].baseIntensity
}

export function createPresenceEmitterMachine(
  opts: CreateMachineOptions,
): PresenceEmitterMachine {
  const states = new Map<string, CursorState>()

  return {
    update(inputs, _dtMs) {
      const seen = new Set<string>()
      const outputs: MachineCursorOutput[] = []
      for (const input of inputs) {
        seen.add(input.cursorId)
        let state = states.get(input.cursorId)
        if (!state) {
          state = { currentMode: input.desiredMode }
          states.set(input.cursorId, state)
        }
        outputs.push({
          id: input.cursorId,
          x: input.x,
          y: input.y,
          color: input.color,
          mode: state.currentMode,
          intensity: baseIntensity(opts.modes, state.currentMode),
          targetRect: input.targetRect,
        })
      }
      for (const id of states.keys()) {
        if (!seen.has(id)) states.delete(id)
      }
      return outputs
    },
    triggerBurst(_cursorId) {
      // Implemented in a later task.
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- presence-emitter-machine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/presence-emitter-machine.ts tests/unit/presence-emitter-machine.test.ts
git commit -m "$(cat <<'EOF'
feat(presence): emitter machine module, stable-state update

Pure machine with per-mode params and transition-table types. This
commit implements the stable path: one output per cursor at the current
mode's baseIntensity. Transitions, burst routing, and orbit_rect
downgrade follow in subsequent commits.
EOF
)"
```

---

## Task 3: Machine — transition crossfade (no burst yet)

**Files:**
- Modify: `src/shared/presence-emitter-machine.ts`
- Modify: `tests/unit/presence-emitter-machine.test.ts`

Add per-cursor transition state and crossfade output. On desiredMode change, start a transition; advance elapsedMs per tick; emit two outputs (`${id}:out`, `${id}:in`) with eased-complementary intensities; collapse when elapsed ≥ duration.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/presence-emitter-machine.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit -- presence-emitter-machine`
Expected: FAIL — transitions not implemented.

- [ ] **Step 3: Replace the CursorState interface**

In `src/shared/presence-emitter-machine.ts`, find:

```ts
interface CursorState {
  currentMode: EmitterMode
}
```

Replace with:

```ts
interface ActiveTransition {
  fromMode: EmitterMode
  toMode: EmitterMode
  elapsedMs: number
  config: TransitionConfig
}

interface CursorState {
  currentMode: EmitterMode
  transition: ActiveTransition | null
}
```

- [ ] **Step 4: Add easing + edge-resolution helpers**

Immediately after the `baseIntensity` helper function, add:

```ts
function applyEase(t: number, kind: FadeEasing): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  switch (kind) {
    case 'ease-in':
      return t * t
    case 'ease-out':
      return 1 - (1 - t) * (1 - t)
    case 'ease-in-out':
      return t * t * (3 - 2 * t)
    default:
      return t
  }
}

function resolveEdge(
  transitions: TransitionTable,
  fromMode: EmitterMode,
  toMode: EmitterMode,
): TransitionConfig {
  const key: TransitionEdgeKey = `${fromMode}->${toMode}`
  return transitions.edges?.[key] ?? transitions.default
}
```

- [ ] **Step 5: Replace the factory body**

Replace the entire body of `createPresenceEmitterMachine` with:

```ts
export function createPresenceEmitterMachine(
  opts: CreateMachineOptions,
): PresenceEmitterMachine {
  const states = new Map<string, CursorState>()

  return {
    update(inputs, dtMs) {
      const seen = new Set<string>()
      const outputs: MachineCursorOutput[] = []

      for (const input of inputs) {
        seen.add(input.cursorId)
        let state = states.get(input.cursorId)
        if (!state) {
          state = { currentMode: input.desiredMode, transition: null }
          states.set(input.cursorId, state)
        }

        // Start a new transition if desiredMode differs from currentMode and
        // no transition is in flight.
        if (!state.transition && input.desiredMode !== state.currentMode) {
          state.transition = {
            fromMode: state.currentMode,
            toMode: input.desiredMode,
            elapsedMs: 0,
            config: resolveEdge(opts.transitions, state.currentMode, input.desiredMode),
          }
        }

        // Advance an active transition.
        if (state.transition) {
          state.transition.elapsedMs += dtMs
          if (state.transition.elapsedMs >= state.transition.config.durationMs) {
            state.currentMode = state.transition.toMode
            state.transition = null
          }
        }

        if (state.transition) {
          const t = Math.min(1, state.transition.elapsedMs / state.transition.config.durationMs)
          const eased = applyEase(t, state.transition.config.easing)
          outputs.push({
            id: `${input.cursorId}:out`,
            x: input.x,
            y: input.y,
            color: input.color,
            mode: state.transition.fromMode,
            intensity: baseIntensity(opts.modes, state.transition.fromMode) * (1 - eased),
            targetRect: input.targetRect,
          })
          outputs.push({
            id: `${input.cursorId}:in`,
            x: input.x,
            y: input.y,
            color: input.color,
            mode: state.transition.toMode,
            intensity: baseIntensity(opts.modes, state.transition.toMode) * eased,
            targetRect: input.targetRect,
          })
        } else {
          outputs.push({
            id: input.cursorId,
            x: input.x,
            y: input.y,
            color: input.color,
            mode: state.currentMode,
            intensity: baseIntensity(opts.modes, state.currentMode),
            targetRect: input.targetRect,
          })
        }
      }

      for (const id of states.keys()) {
        if (!seen.has(id)) states.delete(id)
      }

      return outputs
    },
    triggerBurst(_cursorId) {
      // Implemented in Task 5.
    },
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test:unit -- presence-emitter-machine`
Expected: PASS (all transition + stable tests).

- [ ] **Step 7: Commit**

```bash
git add src/shared/presence-emitter-machine.ts tests/unit/presence-emitter-machine.test.ts
git commit -m "$(cat <<'EOF'
feat(presence): machine transitions with crossfade

Emits two outputs per cursor during a transition — fromMode:out with
decaying intensity and toMode:in with growing intensity — so the
particle system crossfades spawn rates. Edge-specific durations are
resolved from the transition table, falling back to the default edge.
EOF
)"
```

---

## Task 4: Machine — mid-transition retarget

**Files:**
- Modify: `src/shared/presence-emitter-machine.ts`
- Modify: `tests/unit/presence-emitter-machine.test.ts`

When `desiredMode` changes while a transition is in flight, the current `toMode` must update without resetting `elapsedMs` — otherwise a rapid-oscillating desiredMode would freeze the cursor in the in-between forever.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/presence-emitter-machine.test.ts` (inside the transitions describe block):

```ts
it('retargets toMode mid-transition without resetting elapsed', () => {
  const machine = createPresenceEmitterMachine({
    modes: MODES,
    transitions: { default: { durationMs: 200, exitEffect: 'fade', easing: 'linear' } },
  })
  machine.update([input({ desiredMode: 'trail' })], 16)
  // Start trail → orbit_sphere transition, advance 100ms.
  machine.update([input({ desiredMode: 'orbit_sphere', isMoving: false })], 100)
  // Retarget to orbit_rect mid-flight, advance another 100ms → total 200ms.
  const rect = { x: 0, y: 0, width: 100, height: 100 }
  const out = machine.update(
    [input({ desiredMode: 'orbit_rect', isMoving: false, targetRect: rect })],
    100,
  )
  // Elapsed preserved → transition should collapse at the new target.
  expect(out).toHaveLength(1)
  expect(out[0]).toMatchObject({
    id: 'c1',
    mode: 'orbit_rect',
    targetRect: rect,
  })
})

it('keeps fromMode stable when desiredMode flaps back during transition', () => {
  const machine = createPresenceEmitterMachine({
    modes: MODES,
    transitions: { default: { durationMs: 200, exitEffect: 'fade', easing: 'linear' } },
  })
  machine.update([input({ desiredMode: 'trail' })], 16)
  machine.update([input({ desiredMode: 'orbit_sphere', isMoving: false })], 100)
  // Flap back to trail mid-flight. fromMode stays 'trail', toMode becomes 'trail'
  // — i.e. transition cancels cleanly.
  const out = machine.update([input({ desiredMode: 'trail', isMoving: true })], 100)
  expect(out).toHaveLength(1)
  expect(out[0].mode).toBe('trail')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit -- presence-emitter-machine`
Expected: FAIL — retarget not implemented (either the `toMode` stays the stale one or the test for flap-back still sees a transition).

- [ ] **Step 3: Add retarget logic**

In `src/shared/presence-emitter-machine.ts`, replace the "Start a new transition" block with:

```ts
        // Transition management:
        // 1. If we're already in a transition and the user retargets, update
        //    toMode but keep elapsedMs so oscillation can't freeze us.
        // 2. If we're not in a transition and the desired mode differs from
        //    current, start one.
        // 3. If we're already in a transition and desiredMode equals the
        //    current fromMode (flap-back), cancel the transition.
        if (state.transition) {
          if (input.desiredMode === state.transition.fromMode) {
            state.transition = null
          } else if (input.desiredMode !== state.transition.toMode) {
            state.transition.toMode = input.desiredMode
            state.transition.config = resolveEdge(
              opts.transitions,
              state.transition.fromMode,
              input.desiredMode,
            )
          }
        } else if (input.desiredMode !== state.currentMode) {
          state.transition = {
            fromMode: state.currentMode,
            toMode: input.desiredMode,
            elapsedMs: 0,
            config: resolveEdge(opts.transitions, state.currentMode, input.desiredMode),
          }
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit -- presence-emitter-machine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/presence-emitter-machine.ts tests/unit/presence-emitter-machine.test.ts
git commit -m "$(cat <<'EOF'
feat(presence): machine retargets toMode mid-transition

When desiredMode changes during an active transition, update toMode but
keep elapsedMs so rapid oscillation can't strand the cursor between
modes. Flap-back to fromMode cancels the transition outright.
EOF
)"
```

---

## Task 5: Machine — burst routing + exitEffect

**Files:**
- Modify: `src/shared/presence-emitter-machine.ts`
- Modify: `tests/unit/presence-emitter-machine.test.ts`

Add pending-burst queue and expose it on the output type so callers can dispatch to `PresenceParticleControls.triggerBurst`. When a transition starts with `exitEffect: 'burst'`, enqueue a burst for that cursor automatically.

The machine can't call `triggerBurst` directly (no access to the particle system). Expose pending bursts via a new field on the machine output so the hook can drain them and forward to the controls.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/presence-emitter-machine.test.ts`:

```ts
describe('createPresenceEmitterMachine — burst routing', () => {
  it('drains an imperatively queued burst on the next update', () => {
    const machine = createPresenceEmitterMachine({
      modes: MODES,
      transitions: TRANSITIONS,
    })
    machine.update([input({ cursorId: 'a' })], 16)
    machine.triggerBurst('a')
    const { outputs, bursts } = machine.flush([input({ cursorId: 'a' })], 16)
    expect(bursts).toEqual(['a'])
    expect(outputs).toHaveLength(1)
    // Drained: second flush returns no bursts.
    const again = machine.flush([input({ cursorId: 'a' })], 16)
    expect(again.bursts).toEqual([])
  })

  it('enqueues a burst when transition exitEffect is burst', () => {
    const machine = createPresenceEmitterMachine({
      modes: MODES,
      transitions: {
        default: { durationMs: 200, exitEffect: 'burst', easing: 'linear' },
      },
    })
    machine.flush([input({ desiredMode: 'orbit_sphere', isMoving: false })], 16)
    const { bursts } = machine.flush(
      [input({ desiredMode: 'trail', isMoving: true })],
      16,
    )
    expect(bursts).toEqual(['c1'])
  })

  it('targets the outgoing layer when bursting mid-transition', () => {
    const machine = createPresenceEmitterMachine({
      modes: MODES,
      transitions: {
        default: { durationMs: 200, exitEffect: 'burst', easing: 'linear' },
      },
    })
    machine.flush([input({ desiredMode: 'orbit_sphere', isMoving: false })], 16)
    // Transition starts — this call enqueues an exit burst. The burst id should
    // match the outgoing layer id ('c1:out') so the particle system targets
    // the orbit particles that are about to fade.
    const { bursts } = machine.flush(
      [input({ desiredMode: 'trail', isMoving: true })],
      16,
    )
    expect(bursts).toEqual(['c1:out'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit -- presence-emitter-machine`
Expected: FAIL — `flush` method does not exist.

- [ ] **Step 3: Extend the exported interface**

In `src/shared/presence-emitter-machine.ts`, find the `PresenceEmitterMachine` interface and replace it (and add the new `MachineFlushResult` type above it):

```ts
export interface MachineFlushResult {
  outputs: MachineCursorOutput[]
  // Cursor ids (may be suffixed with ':out') to dispatch to
  // PresenceParticleControls.triggerBurst in insertion order.
  bursts: string[]
}

export interface PresenceEmitterMachine {
  update(inputs: MachineCursorInput[], dtMs: number): MachineCursorOutput[]
  flush(inputs: MachineCursorInput[], dtMs: number): MachineFlushResult
  triggerBurst(cursorId: string): void
}
```

- [ ] **Step 4: Replace the factory body with burst-aware flush**

Replace the entire `export function createPresenceEmitterMachine(...)` block with:

```ts
export function createPresenceEmitterMachine(
  opts: CreateMachineOptions,
): PresenceEmitterMachine {
  const states = new Map<string, CursorState>()
  const pendingBursts: string[] = []

  function advanceTransition(state: CursorState, input: MachineCursorInput): void {
    if (state.transition) {
      if (input.desiredMode === state.transition.fromMode) {
        state.transition = null
      } else if (input.desiredMode !== state.transition.toMode) {
        state.transition.toMode = input.desiredMode
        state.transition.config = resolveEdge(
          opts.transitions,
          state.transition.fromMode,
          input.desiredMode,
        )
      }
    } else if (input.desiredMode !== state.currentMode) {
      const config = resolveEdge(opts.transitions, state.currentMode, input.desiredMode)
      state.transition = {
        fromMode: state.currentMode,
        toMode: input.desiredMode,
        elapsedMs: 0,
        config,
      }
      if (config.exitEffect === 'burst') {
        // Target the outgoing layer so the orbit particles that are about to
        // fade are the ones that burst.
        pendingBursts.push(`${input.cursorId}:out`)
      }
    }
  }

  function emitOutputs(
    state: CursorState,
    input: MachineCursorInput,
    outputs: MachineCursorOutput[],
  ): void {
    if (state.transition) {
      const t = Math.min(1, state.transition.elapsedMs / state.transition.config.durationMs)
      const eased = applyEase(t, state.transition.config.easing)
      outputs.push({
        id: `${input.cursorId}:out`,
        x: input.x,
        y: input.y,
        color: input.color,
        mode: state.transition.fromMode,
        intensity: baseIntensity(opts.modes, state.transition.fromMode) * (1 - eased),
        targetRect: input.targetRect,
      })
      outputs.push({
        id: `${input.cursorId}:in`,
        x: input.x,
        y: input.y,
        color: input.color,
        mode: state.transition.toMode,
        intensity: baseIntensity(opts.modes, state.transition.toMode) * eased,
        targetRect: input.targetRect,
      })
    } else {
      outputs.push({
        id: input.cursorId,
        x: input.x,
        y: input.y,
        color: input.color,
        mode: state.currentMode,
        intensity: baseIntensity(opts.modes, state.currentMode),
        targetRect: input.targetRect,
      })
    }
  }

  function flush(inputs: MachineCursorInput[], dtMs: number): MachineFlushResult {
    const seen = new Set<string>()
    const outputs: MachineCursorOutput[] = []

    for (const input of inputs) {
      seen.add(input.cursorId)
      let state = states.get(input.cursorId)
      if (!state) {
        state = { currentMode: input.desiredMode, transition: null }
        states.set(input.cursorId, state)
      }

      advanceTransition(state, input)

      if (state.transition) {
        state.transition.elapsedMs += dtMs
        if (state.transition.elapsedMs >= state.transition.config.durationMs) {
          state.currentMode = state.transition.toMode
          state.transition = null
        }
      }

      emitOutputs(state, input, outputs)
    }

    for (const id of states.keys()) {
      if (!seen.has(id)) states.delete(id)
    }

    const bursts = pendingBursts.slice()
    pendingBursts.length = 0
    return { outputs, bursts }
  }

  return {
    update(inputs, dtMs) {
      return flush(inputs, dtMs).outputs
    },
    flush,
    triggerBurst(cursorId) {
      pendingBursts.push(cursorId)
    },
  }
}
```

Note: `update` now delegates to `flush` and drops the burst list (convenient for tests that don't care about bursts). The burst queue is an array, not a Set, so repeated `triggerBurst('a')` calls would stack — drop duplicates if that becomes a problem, but today's only repeat source would be rapid click transitions (already rate-limited by the activity transition guard in AgentCursorLayer).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:unit -- presence-emitter-machine`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/presence-emitter-machine.ts tests/unit/presence-emitter-machine.test.ts
git commit -m "$(cat <<'EOF'
feat(presence): machine burst queue + exit-effect routing

flush() returns per-tick pending burst ids alongside outputs. Imperative
triggerBurst() enqueues for the next flush; starting a transition with
exitEffect:'burst' auto-enqueues a burst on the outgoing layer so the
orbit particles that are about to fade are the ones that exhale.
EOF
)"
```

---

## Task 6: Machine — orbit_rect downgrade when targetRect is missing

**Files:**
- Modify: `src/shared/presence-emitter-machine.ts`
- Modify: `tests/unit/presence-emitter-machine.test.ts`

Today's `AgentCursorLayer` already downgrades orbit_rect → orbit_sphere when the frame's rect can't be resolved. Make the machine own that rule so both callers inherit it. The downgrade happens at the point of consuming `desiredMode`: if `desiredMode === 'orbit_rect'` and `targetRect == null`, substitute `orbit_sphere` before the transition logic runs.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/presence-emitter-machine.test.ts`:

```ts
describe('createPresenceEmitterMachine — orbit_rect downgrade', () => {
  it('downgrades orbit_rect → orbit_sphere when targetRect is null', () => {
    const machine = createPresenceEmitterMachine({
      modes: MODES,
      transitions: TRANSITIONS,
    })
    const out = machine.update(
      [input({ desiredMode: 'orbit_rect', isMoving: false, targetRect: null })],
      16,
    )
    expect(out).toHaveLength(1)
    expect(out[0].mode).toBe('orbit_sphere')
  })

  it('does not downgrade when rect is present', () => {
    const machine = createPresenceEmitterMachine({
      modes: MODES,
      transitions: TRANSITIONS,
    })
    const rect = { x: 0, y: 0, width: 10, height: 10 }
    const out = machine.update(
      [input({ desiredMode: 'orbit_rect', isMoving: false, targetRect: rect })],
      16,
    )
    expect(out[0].mode).toBe('orbit_rect')
    expect(out[0].targetRect).toEqual(rect)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit -- presence-emitter-machine`
Expected: FAIL — still emits orbit_rect.

- [ ] **Step 3: Add downgrade**

At the top of the per-input loop in `flush()`, before calling `advanceTransition`:

```ts
      // Downgrade orbit_rect to orbit_sphere when no rect is resolvable —
      // same rule AgentCursorLayer enforced before this machine existed.
      const effectiveDesired: EmitterMode =
        input.desiredMode === 'orbit_rect' && !input.targetRect
          ? 'orbit_sphere'
          : input.desiredMode
      const resolvedInput: MachineCursorInput = {
        ...input,
        desiredMode: effectiveDesired,
      }
```

Then use `resolvedInput` instead of `input` in the transition + output blocks.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit -- presence-emitter-machine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/presence-emitter-machine.ts tests/unit/presence-emitter-machine.test.ts
git commit -m "$(cat <<'EOF'
feat(presence): machine downgrades orbit_rect without a target rect

Centralizes the existing AgentCursorLayer downgrade inside the machine,
so both production and playground callers get the same fallback
behavior without duplicating the rule at the call site.
EOF
)"
```

---

## Task 7: Config module with default modes + transitions

**Files:**
- Create: `src/shared/presence-emitter-config.ts`

Central location for the current tuning constants so callers can spread-override rather than re-declare the whole struct. Values match today's `PresenceParticleTrail` defaults and hardcoded orbit/burst constants.

No tests — this file is just constants validated by their consumers.

- [ ] **Step 1: Create the config module**

`src/shared/presence-emitter-config.ts`:

```ts
import type {
  EmitterModes,
  TransitionTable,
} from './presence-emitter-machine'

// Mirrors the constants that previously lived in PresenceParticleTrail.tsx +
// the default props it exposed. When renderer callers want to tweak a single
// param, spread these defaults first:
//   { ...DEFAULT_EMITTER_MODES, orbit_sphere: { ...DEFAULT_EMITTER_MODES.orbit_sphere, radiusPx: 12 } }
export const DEFAULT_EMITTER_MODES: EmitterModes = {
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

// Every transition uses crossfade + burst exit by default. Edge overrides
// are empty for now; individual transitions can be retuned here as we
// dogfood the machine.
export const DEFAULT_TRANSITION_TABLE: TransitionTable = {
  default: {
    durationMs: 250,
    exitEffect: 'burst',
    easing: 'ease-in-out',
  },
  edges: {
    // Entering trail from an orbit mode: the burst is the "exhale" — no
    // second burst needed on the way in. Default already covers this; this
    // entry is a placeholder illustrating how edges override the default.
  },
}
```

- [ ] **Step 2: Typecheck to confirm imports resolve**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shared/presence-emitter-config.ts
git commit -m "$(cat <<'EOF'
feat(presence): default emitter modes and transition table

Central tuning constants for the machine, mirroring the values that
previously lived inline in PresenceParticleTrail. Callers can spread
these defaults and override individual params without redeclaring the
full struct.
EOF
)"
```

---

## Task 8: Extend PresenceParticleTrail with per-mode params

**Files:**
- Modify: `src/renderer/shared/PresenceParticleTrail.tsx`

Today's orbit/burst constants (`ORBIT_SPHERE_RADIUS_PX`, `ORBIT_SPHERE_ANGULAR_VELOCITY`, `ORBIT_SPHERE_RADIUS_FADE_IN_SECONDS`, `ORBIT_RECT_CROSS_JITTER_PX`, `ORBIT_RECT_FADE_IN_SECONDS`, `BURST_SPEED_PX_PER_SEC`, `BURST_SPEED_JITTER`, `BURST_LIFETIME_SECONDS`, `BURST_DRAG_PER_SECOND`) become configurable through new optional props. Defaults preserve current behavior — this task should be a pure refactor with no visual change when the component is called without new props.

Keep the existing flat trail props (`lifetimeSeconds`, `driftStrength`, …) — the hook in Task 9 will feed them from `EmitterModes.trail`.

- [ ] **Step 1: Add new optional props**

In `src/renderer/shared/PresenceParticleTrail.tsx`, extend the `Props` interface (immediately after `emitsPerFrame`):

```ts
  /** Orbit sphere tuning. Defaults match the existing constants. */
  orbitSphereRadiusPx?: number
  orbitSphereAngularVelocityRadPerSec?: number
  orbitSphereRadiusFadeInSeconds?: number
  orbitSphereBaseIntensity?: number
  /** Orbit rect tuning. */
  orbitRectCrossJitterPx?: number
  orbitRectAngularVelocityRadPerSec?: number
  orbitRectFadeInSeconds?: number
  orbitRectBaseIntensity?: number
  /** Burst (click transient) tuning. */
  burstSpeedPxPerSec?: number
  burstSpeedJitter?: number
  burstLifetimeSeconds?: number
  burstDragPerSecond?: number
```

- [ ] **Step 2: Replace constant references with prop lookups (falling back to existing constants)**

Identify every reference to `ORBIT_SPHERE_RADIUS_PX`, `ORBIT_SPHERE_ANGULAR_VELOCITY`, `ORBIT_SPHERE_RADIUS_FADE_IN_SECONDS`, `ORBIT_RECT_CROSS_JITTER_PX`, `ORBIT_RECT_FADE_IN_SECONDS`, `BURST_SPEED_PX_PER_SEC`, `BURST_SPEED_JITTER`, `BURST_LIFETIME_SECONDS`, `BURST_DRAG_PER_SECOND` inside the component. Use `grep -n "ORBIT_SPHERE\|ORBIT_RECT\|BURST_" src/renderer/shared/PresenceParticleTrail.tsx` to enumerate.

Inside the component body, near the top (after destructuring props), add:

```ts
  const orbitSphereRadius = props.orbitSphereRadiusPx ?? ORBIT_SPHERE_RADIUS_PX
  const orbitSphereAngular =
    props.orbitSphereAngularVelocityRadPerSec ?? ORBIT_SPHERE_ANGULAR_VELOCITY
  const orbitSphereFadeIn =
    props.orbitSphereRadiusFadeInSeconds ?? ORBIT_SPHERE_RADIUS_FADE_IN_SECONDS
  const orbitRectCrossJitter =
    props.orbitRectCrossJitterPx ?? ORBIT_RECT_CROSS_JITTER_PX
  const orbitRectAngular =
    props.orbitRectAngularVelocityRadPerSec ?? ORBIT_SPHERE_ANGULAR_VELOCITY
  const orbitRectFadeIn =
    props.orbitRectFadeInSeconds ?? ORBIT_RECT_FADE_IN_SECONDS
  const burstSpeed = props.burstSpeedPxPerSec ?? BURST_SPEED_PX_PER_SEC
  const burstJitter = props.burstSpeedJitter ?? BURST_SPEED_JITTER
  const burstLifetime = props.burstLifetimeSeconds ?? BURST_LIFETIME_SECONDS
  const burstDrag = props.burstDragPerSecond ?? BURST_DRAG_PER_SECOND
```

Replace every occurrence of the constants inside shader-adjacent and setup code with the locals above. For shader uniforms, pass `orbitSphereRadius` / `burstSpeed` / etc. through the existing uniform-binding paths (match the pattern used for `driftStrength` or similar props already plumbed).

If any constants are captured in a closure or passed to `createSystem`-style helpers, thread the prop value the same way the component already threads `lifetimeSeconds`.

Then remove the unused `const` declarations at the top of the file (lines that previously held the constants). If any are re-exported (e.g., `ORBIT_SPHERE_INTENSITY`, `ORBIT_RECT_INTENSITY` for the playground), leave those — they're about intensity, not tuning, and are consumed externally.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Run unit tests**

Run: `pnpm test:unit`
Expected: PASS (no tests should regress — this is a pure prop-surface extension).

- [ ] **Step 5: Manual smoke (dev server)**

Run: `pnpm dev`

Verify visually that the existing presence playground renders trail, orbit_sphere, and orbit_rect modes identically to before. (No machine wired yet — the playground dropdown still drives mode directly.) Test the Burst button too.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/shared/PresenceParticleTrail.tsx
git commit -m "$(cat <<'EOF'
refactor(presence): per-mode params as props on PresenceParticleTrail

Orbit sphere, orbit rect, and burst tunings are now optional props with
defaults matching the prior inline constants. No behavior change when
called without new props; the state-machine hook (next) uses them to
feed per-mode params through from EmitterModes config.
EOF
)"
```

---

## Task 9: usePresenceEmitter hook

**Files:**
- Create: `src/renderer/shared/usePresenceEmitter.ts`

Thin React wrapper around the pure machine. Owns:
- Machine instance (created once via `useRef`).
- Particle controls ref (set via the component's `onReady` callback).
- Per-cursor movement tracking (position deltas → `isMoving` with debounce).
- Per-frame tick (uses `requestAnimationFrame` elapsed time as `dtMs`).
- Draining burst ids and dispatching to `PresenceParticleControls.triggerBurst`.

Returns `{outputs, controls, onReady}` — outputs go straight to `PresenceParticleTrail.cursors`, controls expose `triggerBurst(cursorId)` for caller-initiated bursts (e.g., click transitions), and `onReady` is the callback the caller passes to the component.

- [ ] **Step 1: Create the hook**

`src/renderer/shared/usePresenceEmitter.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createPresenceEmitterMachine,
  type EmitterModes,
  type MachineCursorInput,
  type MachineCursorOutput,
  type PresenceEmitterMachine,
  type TransitionTable,
} from '../../shared/presence-emitter-machine'
import type { PresenceParticleControls } from './PresenceParticleTrail'

const STATIONARY_DEBOUNCE_MS = 250
const MOVE_THRESHOLD_PX = 2

export interface UsePresenceEmitterArgs {
  modes: EmitterModes
  transitions: TransitionTable
  stationaryDebounceMs?: number
}

export interface UsePresenceEmitterResult {
  outputs: MachineCursorOutput[]
  push: (inputs: ReadonlyArray<MachineCursorInputWithoutMovement>) => void
  controls: { triggerBurst: (cursorId: string) => void }
  onReady: (c: PresenceParticleControls) => void
}

// Callers pass raw inputs without isMoving; the hook computes it from
// position deltas, or accepts an explicit override.
export interface MachineCursorInputWithoutMovement
  extends Omit<MachineCursorInput, 'isMoving'> {
  isMoving?: boolean
}

export function usePresenceEmitter(
  args: UsePresenceEmitterArgs,
): UsePresenceEmitterResult {
  const machineRef = useRef<PresenceEmitterMachine | null>(null)
  if (!machineRef.current) {
    machineRef.current = createPresenceEmitterMachine({
      modes: args.modes,
      transitions: args.transitions,
    })
  }

  const lastPosRef = useRef<Map<string, { x: number; y: number; tMs: number }>>(
    new Map(),
  )
  const particleControlsRef = useRef<PresenceParticleControls | null>(null)
  const lastTickMsRef = useRef<number>(performance.now())
  const debounceMs = args.stationaryDebounceMs ?? STATIONARY_DEBOUNCE_MS

  const [outputs, setOutputs] = useState<MachineCursorOutput[]>([])

  const push = useCallback(
    (inputs: ReadonlyArray<MachineCursorInputWithoutMovement>) => {
      const now = performance.now()
      const dtMs = now - lastTickMsRef.current
      lastTickMsRef.current = now

      const positions = lastPosRef.current
      const resolved: MachineCursorInput[] = inputs.map((i) => {
        if (typeof i.isMoving === 'boolean') {
          positions.set(i.cursorId, { x: i.x, y: i.y, tMs: now })
          return { ...i, isMoving: i.isMoving } as MachineCursorInput
        }
        const prev = positions.get(i.cursorId)
        let isMoving = false
        if (!prev) {
          isMoving = false
        } else {
          const dx = i.x - prev.x
          const dy = i.y - prev.y
          const moved = Math.hypot(dx, dy) > MOVE_THRESHOLD_PX
          if (moved) {
            isMoving = true
            positions.set(i.cursorId, { x: i.x, y: i.y, tMs: now })
          } else {
            isMoving = now - prev.tMs < debounceMs
          }
        }
        if (!positions.has(i.cursorId)) {
          positions.set(i.cursorId, { x: i.x, y: i.y, tMs: now })
        }
        return { ...i, isMoving } as MachineCursorInput
      })

      // Prune positions for cursors that disappeared.
      const seen = new Set(resolved.map((r) => r.cursorId))
      for (const id of positions.keys()) {
        if (!seen.has(id)) positions.delete(id)
      }

      const { outputs, bursts } = machineRef.current!.flush(resolved, dtMs)
      const controls = particleControlsRef.current
      if (controls) {
        for (const id of bursts) controls.triggerBurst(id)
      }
      setOutputs(outputs)
    },
    [debounceMs],
  )

  const controls = useMemo(
    () => ({
      triggerBurst: (cursorId: string) => {
        machineRef.current!.triggerBurst(cursorId)
      },
    }),
    [],
  )

  const onReady = useCallback((c: PresenceParticleControls) => {
    particleControlsRef.current = c
  }, [])

  useEffect(() => {
    // Reset lastTick on mount so the first push's dtMs is small.
    lastTickMsRef.current = performance.now()
  }, [])

  return { outputs, push, controls, onReady }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/shared/usePresenceEmitter.ts
git commit -m "$(cat <<'EOF'
feat(presence): usePresenceEmitter hook

React glue around the pure state machine: computes isMoving from
position deltas (with debounce) unless the caller overrides, drains
pending bursts into the particle controls on each push, and returns a
stable controls object so callers can imperatively trigger bursts on
click transitions.
EOF
)"
```

---

## Task 10: Wire AgentCursorLayer through the hook

**Files:**
- Modify: `src/renderer/canvas-bg/AgentCursorLayer.tsx`

Replace the direct `emitterModeForPresenceCursor` + `PresenceParticleCursor` construction with `usePresenceEmitter`. The click-to-burst effect continues to work, now via `controls.triggerBurst(sessionId)` instead of `particleControlsRef.current?.triggerBurst`.

- [ ] **Step 1: Refactor the trail-cursor construction**

In `src/renderer/canvas-bg/AgentCursorLayer.tsx`:

1. Replace imports:

```ts
// Remove:
//   import { emitterModeForPresenceCursor } from '../../shared/agent-presence'
// Add:
import { defaultAutoPolicy } from '../../shared/presence-emitter-policy'
import { usePresenceEmitter } from '../shared/usePresenceEmitter'
import {
  DEFAULT_EMITTER_MODES,
  DEFAULT_TRANSITION_TABLE,
} from '../../shared/presence-emitter-config'
```

2. Replace the `particleControlsRef` + direct `trailCursors` construction with hook usage. Before the return statement, replace the existing `trailCursors` map with:

```ts
  const emitter = usePresenceEmitter({
    modes: DEFAULT_EMITTER_MODES,
    transitions: DEFAULT_TRANSITION_TABLE,
  })

  useEffect(() => {
    const inputs = animated.map(({ cursor, point, isAnimating }) => {
      const frame = cursor.frameId
        ? (frames.find((f) => f.id === cursor.frameId) ?? null)
        : null
      const desiredBase = defaultAutoPolicy.pick({
        isMoving: isAnimating,
        targetRect: null, // resolved below
        activity: cursor.activity,
        labelKey: cursor.labelKey,
      })
      const targetRect =
        desiredBase === 'orbit_rect'
          ? resolveTargetRectScreen(cursor, frame, overlayOffsetY)
          : null
      // Re-pick with the resolved rect so policy can downgrade if needed.
      const desiredMode = defaultAutoPolicy.pick({
        isMoving: isAnimating,
        targetRect,
        activity: cursor.activity,
        labelKey: cursor.labelKey,
      })
      return {
        cursorId: cursor.sessionId,
        x: canvasOrigin.x + pan.x + point.x * zoom + CURSOR_TRAIL_OFFSET.x,
        y:
          canvasOrigin.y +
          pan.y -
          overlayOffsetY +
          point.y * zoom +
          CURSOR_TRAIL_OFFSET.y,
        color: cursor.color,
        desiredMode,
        targetRect,
        isMoving: isAnimating,
      }
    })
    emitter.push(inputs)
  }, [animated, frames, canvasOrigin, pan, zoom, overlayOffsetY, emitter])
```

3. Replace the click-triggered-burst effect:

```ts
  useEffect(() => {
    const prev = prevActivityRef.current
    for (const cursor of cursors) {
      const last = prev.get(cursor.sessionId)
      const justClicked =
        cursor.activity === 'acting' &&
        cursor.labelKey === 'click_target' &&
        last !== 'acting'
      if (justClicked) {
        emitter.controls.triggerBurst(cursor.sessionId)
      }
      prev.set(cursor.sessionId, cursor.activity)
    }
    const active = new Set(cursors.map((c) => c.sessionId))
    for (const id of prev.keys()) {
      if (!active.has(id)) prev.delete(id)
    }
  }, [cursors, emitter])
```

4. Remove the standalone `particleControlsRef` (now owned by the hook) and the `trailCursors` const. Pass `emitter.outputs` to `PresenceParticleTrail.cursors` and `emitter.onReady` to `onReady`:

```tsx
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 9999 }}>
      <PresenceParticleTrail
        cursors={emitter.outputs}
        onReady={emitter.onReady}
        orbitSphereRadiusPx={DEFAULT_EMITTER_MODES.orbit_sphere.radiusPx}
        orbitSphereAngularVelocityRadPerSec={
          DEFAULT_EMITTER_MODES.orbit_sphere.angularVelocityRadPerSec
        }
        orbitSphereRadiusFadeInSeconds={
          DEFAULT_EMITTER_MODES.orbit_sphere.radiusFadeInSeconds
        }
        orbitRectCrossJitterPx={DEFAULT_EMITTER_MODES.orbit_rect.crossJitterPx}
        orbitRectAngularVelocityRadPerSec={
          DEFAULT_EMITTER_MODES.orbit_rect.angularVelocityRadPerSec
        }
        orbitRectFadeInSeconds={DEFAULT_EMITTER_MODES.orbit_rect.fadeInSeconds}
        burstSpeedPxPerSec={DEFAULT_EMITTER_MODES.burst.speedPxPerSec}
        burstSpeedJitter={DEFAULT_EMITTER_MODES.burst.speedJitter}
        burstLifetimeSeconds={DEFAULT_EMITTER_MODES.burst.lifetimeSeconds}
        burstDragPerSecond={DEFAULT_EMITTER_MODES.burst.dragPerSecond}
        lifetimeSeconds={DEFAULT_EMITTER_MODES.trail.lifetimeSeconds}
        emitsPerFrame={DEFAULT_EMITTER_MODES.trail.emitsPerFrame}
        emitSpeedReferencePxPerSec={
          DEFAULT_EMITTER_MODES.trail.emitSpeedReferencePxPerSec
        }
        emitSpeedBias={DEFAULT_EMITTER_MODES.trail.emitSpeedBias}
        driftStrength={DEFAULT_EMITTER_MODES.trail.driftStrength}
        driftReferenceDistance={DEFAULT_EMITTER_MODES.trail.driftReferenceDistance}
        driftTurnRate={DEFAULT_EMITTER_MODES.trail.driftTurnRate}
        driftFlowScale={DEFAULT_EMITTER_MODES.trail.driftFlowScale}
        holdSeconds={DEFAULT_EMITTER_MODES.trail.holdSeconds}
        fadeOutGraceSeconds={DEFAULT_EMITTER_MODES.trail.fadeOutGraceSeconds}
        fadeOutSeconds={DEFAULT_EMITTER_MODES.trail.fadeOutSeconds}
        fadeOutEasing={DEFAULT_EMITTER_MODES.trail.fadeOutEasing}
      />
      {showLabels ? <PresenceLabels cursors={animated} /> : null}
    </div>
  )
```

(The existing render block has label rendering and possibly other children; preserve them — only the `PresenceParticleTrail` block and the cursor construction change. Verify by reading the file around the return and adapting.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Run unit tests**

Run: `pnpm test:unit`
Expected: PASS.

- [ ] **Step 4: Run smoke tests**

Run: `pnpm test:smoke`
Expected: PASS.

- [ ] **Step 5: Manual smoke (dev server)**

Run: `pnpm dev`

Verify in the real app:
- An agent cursor traveling shows the trail.
- An agent cursor stopping (thinking/waiting) crossfades into the orbit sphere with a burst on the old trail's exit.
- An agent cursor in `inspect_page` mode with a visible frame shows orbit_rect; no frame → orbit_sphere.
- Clicking in the agent's task (click_target activity) fires a burst.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/canvas-bg/AgentCursorLayer.tsx
git commit -m "$(cat <<'EOF'
refactor(presence): route AgentCursorLayer through the state machine

AgentCursorLayer feeds raw cursor state into usePresenceEmitter and
renders whatever outputs it returns. Policy picks desiredMode (with
isMoving from the animation tween); the machine owns transitions,
crossfade, and burst routing. Click-to-burst goes through the same
controls object the machine exposes.
EOF
)"
```

---

## Task 11: Wire PresencePlayground through the hook (auto mode + always-visible rect)

**Files:**
- Modify: `src/renderer/debug/PresencePlayground.tsx`

The playground gains an "Auto" option in the mode dropdown that hands mode selection to the policy. Non-auto options force `desiredMode` to that specific mode. The demo rect becomes always visible and is the playground's `targetRect` source — clicking inside it signals the policy to pick `orbit_rect` (once stationary), clicking outside clears the rect.

- [ ] **Step 1: Update types and state for the dropdown**

In `src/renderer/debug/PresencePlayground.tsx`:

1. Replace the `EMITTER_MODE_OPTIONS` + value type with:

```ts
type PlaygroundModeSelection =
  | 'auto'
  | 'trail'
  | 'orbit_sphere'
  | 'orbit_rect'

const MODE_SELECTION_OPTIONS: Array<{
  value: PlaygroundModeSelection
  label: string
  hint: string
}> = [
  { value: 'auto', label: 'Auto', hint: 'Moving → trail, stationary → orbit' },
  { value: 'trail', label: 'Trail', hint: 'Force' },
  { value: 'orbit_sphere', label: 'Orbit sphere', hint: 'Force' },
  { value: 'orbit_rect', label: 'Orbit rect', hint: 'Force' },
]
```

2. Replace `const [emitterMode, setEmitterMode] = useState<PresenceParticleEmitterMode>('trail')` with:

```ts
  const [modeSelection, setModeSelection] = useState<PlaygroundModeSelection>('auto')
  const [rectActive, setRectActive] = useState(false)
```

- [ ] **Step 2: Track rect-click state**

Replace `handleClick` with:

```tsx
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const host = hostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    const target: Vec2 = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }

    // Detect whether the click is inside the dotted rect; this is the
    // playground's targetRect signal.
    const inside =
      target.x >= DEMO_RECT.x &&
      target.x <= DEMO_RECT.x + DEMO_RECT.width &&
      target.y >= DEMO_RECT.y &&
      target.y <= DEMO_RECT.y + DEMO_RECT.height
    setRectActive(inside)

    const from = positionRef.current
    const distance = Math.hypot(target.x - from.x, target.y - from.y)
    if (distance < 1) return

    const t = tuningRef.current
    const spline = foldSpline(from, tangentRef.current, [target], SPLINE_ALPHA)
    const splineSpeedScale = distanceSpeedScale(t, spline.totalLength)
    const effectiveSpeed = t.baseSpeedPxS * splineSpeedScale
    const durationMs =
      effectiveSpeed > 0 ? (spline.totalLength / effectiveSpeed) * 1000 : Infinity

    const id = ++seqRef.current
    const polyline = spline.polyline(SPLINE_SAMPLES)
    setActiveSplinePolyline(polyline)
    setTrails((prev) => {
      const next = [...prev, { id, polyline, target }]
      return next.length > TRAIL_LIMIT ? next.slice(next.length - TRAIL_LIMIT) : next
    })
    setStats({
      length: spline.totalLength,
      speedPxS: effectiveSpeed,
      durationMs,
    })

    activeRef.current = {
      id,
      spline,
      splineSpeedScale,
      durationMs,
      elapsedMs: 0,
      target,
    }
    setIsTraveling(true)
    ensureRaf()
  }
```

- [ ] **Step 3: Drive the hook**

Replace the existing direct particle-trail block with:

```tsx
  const emitter = usePresenceEmitter({
    modes: DEFAULT_EMITTER_MODES,
    transitions: DEFAULT_TRANSITION_TABLE,
  })

  useEffect(() => {
    const targetRect = rectActive ? DEMO_RECT : null
    const desiredMode: EmitterMode =
      modeSelection === 'auto'
        ? defaultAutoPolicy.pick({ isMoving: isTraveling, targetRect })
        : modeSelection
    emitter.push([
      {
        cursorId: 'playground',
        x: displayPos.x + trail.offsetX,
        y: displayPos.y + trail.offsetY,
        color: CURSOR_COLOR,
        desiredMode,
        targetRect,
        // Explicit override — we already know whether the cursor is tweening.
        isMoving: isTraveling,
      },
    ])
  }, [
    displayPos,
    trail.offsetX,
    trail.offsetY,
    modeSelection,
    isTraveling,
    rectActive,
    emitter,
  ])
```

(Imports to add at the top of the file:
`import { defaultAutoPolicy } from '../../shared/presence-emitter-policy'`,
`import type { EmitterMode } from '../../shared/presence-emitter-machine'`,
`import { DEFAULT_EMITTER_MODES, DEFAULT_TRANSITION_TABLE } from '../../shared/presence-emitter-config'`,
`import { usePresenceEmitter } from '../shared/usePresenceEmitter'`.)

- [ ] **Step 4: Update the PresenceParticleTrail call + dropdown + always-visible rect**

Replace the particle-trail JSX with:

```tsx
        <DemoRectOverlay rect={DEMO_RECT} active={rectActive} />
        <PresenceParticleTrail
          cursors={emitter.outputs}
          onReady={emitter.onReady}
          size={trail.size}
          lifetimeSeconds={trail.lifetimeSeconds}
          holdSeconds={trail.driftGraceSeconds}
          driftStrength={trail.driftStrength}
          driftReferenceDistance={trail.driftReferenceDistance}
          driftTurnRate={trail.driftTurnRate}
          driftFlowScale={trail.driftFlowScale}
          particleCount={trail.particleCount}
          fadeOutGraceSeconds={trail.fadeOutGraceSeconds}
          fadeOutSeconds={trail.fadeOutSeconds}
          fadeOutEasing={trail.fadeOutEasing}
          emitSpeedReferencePxPerSec={trail.emitSpeedReferencePxPerSec}
          emitSpeedBias={trail.emitSpeedBias}
          emitsPerFrame={trail.emitsPerFrame}
          orbitSphereRadiusPx={DEFAULT_EMITTER_MODES.orbit_sphere.radiusPx}
          orbitSphereAngularVelocityRadPerSec={
            DEFAULT_EMITTER_MODES.orbit_sphere.angularVelocityRadPerSec
          }
          orbitSphereRadiusFadeInSeconds={
            DEFAULT_EMITTER_MODES.orbit_sphere.radiusFadeInSeconds
          }
          orbitRectCrossJitterPx={DEFAULT_EMITTER_MODES.orbit_rect.crossJitterPx}
          orbitRectAngularVelocityRadPerSec={
            DEFAULT_EMITTER_MODES.orbit_rect.angularVelocityRadPerSec
          }
          orbitRectFadeInSeconds={DEFAULT_EMITTER_MODES.orbit_rect.fadeInSeconds}
          burstSpeedPxPerSec={DEFAULT_EMITTER_MODES.burst.speedPxPerSec}
          burstSpeedJitter={DEFAULT_EMITTER_MODES.burst.speedJitter}
          burstLifetimeSeconds={DEFAULT_EMITTER_MODES.burst.lifetimeSeconds}
          burstDragPerSecond={DEFAULT_EMITTER_MODES.burst.dragPerSecond}
        />
```

Update `EmitterModeSelector`:

```tsx
function EmitterModeSelector({
  selection,
  onChange,
  onTriggerBurst,
}: {
  selection: PlaygroundModeSelection
  onChange: (next: PlaygroundModeSelection) => void
  onTriggerBurst: () => void
}) {
  const active = MODE_SELECTION_OPTIONS.find((o) => o.value === selection)
  const canBurst = selection === 'orbit_sphere' || selection === 'orbit_rect' || selection === 'auto'
  return (
    <div
      className="absolute left-4 top-12 flex items-center gap-2 rounded px-2 py-1 text-[11px]"
      style={{
        background: 'color-mix(in srgb, var(--surface-panel) 88%, transparent)',
      }}
    >
      <span className="opacity-60">Mode</span>
      <select
        value={selection}
        onChange={(e) => onChange(e.target.value as PlaygroundModeSelection)}
        className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
      >
        {MODE_SELECTION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {active ? <span className="opacity-50">· {active.hint}</span> : null}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onTriggerBurst()
        }}
        disabled={!canBurst}
        title={
          canBurst
            ? 'Convert the current orbit particles to a radial burst'
            : 'Burst only applies when the cursor is in an orbit mode'
        }
        className="ml-1 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900"
      >
        Burst
      </button>
    </div>
  )
}
```

Update the call site:

```tsx
        <EmitterModeSelector
          selection={modeSelection}
          onChange={setModeSelection}
          onTriggerBurst={() => emitter.controls.triggerBurst('playground')}
        />
```

Update `DemoRectOverlay` to accept an `active` prop for styling:

```tsx
function DemoRectOverlay({
  rect,
  active,
}: {
  rect: PresenceParticleTargetRect
  active: boolean
}) {
  return (
    <div
      className="pointer-events-none absolute rounded-sm border border-dashed transition-colors"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        borderColor: `color-mix(in srgb, var(--text-primary) ${active ? 70 : 35}%, transparent)`,
        background: active
          ? 'color-mix(in srgb, var(--text-primary) 8%, transparent)'
          : 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
      }}
    />
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Manual smoke (dev server)**

Run: `pnpm dev`

In the playground:
- Auto mode: move cursor → trail; stop → crossfade to orbit_sphere with burst at trail exit.
- Click inside the dotted rect: cursor tweens there; on arrival, crossfades to orbit_rect (still with exit burst off the sphere).
- Click outside the rect: orbit_rect exits with burst, orbit_sphere reforms at the new resting point.
- Toggle dropdown to "Trail" / "Orbit sphere" / "Orbit rect" — those force the mode regardless of movement/rect state.
- Burst button still fires on orbit modes.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/debug/PresencePlayground.tsx
git commit -m "$(cat <<'EOF'
feat(presence-playground): auto mode + always-visible demo rect

Playground drives the new state machine. Auto mode routes through the
default policy (moving → trail, stationary → orbit_sphere, stationary
over the dotted rect → orbit_rect). Non-auto dropdown options force
a specific desiredMode. The demo rect is always visible and drives
targetRect based on click-in / click-out.
EOF
)"
```

---

## Task 12: Remove the superseded emitterModeForPresenceCursor

**Files:**
- Modify: `src/shared/agent-presence.ts`
- Delete: `tests/unit/agent-presence-emitter.test.ts`

After Tasks 10–11 nothing imports `emitterModeForPresenceCursor` or its `PresenceEmitterMode` type alias. Remove them and the corresponding test file.

- [ ] **Step 1: Verify no remaining callers**

Run: `grep -rn "emitterModeForPresenceCursor\|PresenceEmitterMode" src/ tests/`
Expected output: **no matches** (the remaining references should only be in this very file before we edit it). If any matches remain outside `src/shared/agent-presence.ts`, go back and fix the caller.

- [ ] **Step 2: Remove the function and type**

Edit `src/shared/agent-presence.ts`:

Delete the export `export type PresenceEmitterMode = ...` and the `export function emitterModeForPresenceCursor(...)` block, plus the comment above it. Leave `labelForKey`, `applyHint`, `labelForPresenceCursor`, `summarizePresenceCursor` intact — those are unrelated.

- [ ] **Step 3: Delete the old test file**

```bash
git rm tests/unit/agent-presence-emitter.test.ts
```

- [ ] **Step 4: Typecheck + unit + smoke**

Run: `pnpm typecheck && pnpm test:unit && pnpm test:smoke`
Expected: PASS across all three.

- [ ] **Step 5: Commit**

```bash
git add src/shared/agent-presence.ts tests/unit/agent-presence-emitter.test.ts
git commit -m "$(cat <<'EOF'
refactor(presence): drop emitterModeForPresenceCursor

Superseded by defaultAutoPolicy.pick. The old unit test is replaced by
tests/unit/presence-emitter-policy.test.ts, which covers the same
activity-to-mode cases plus the new isMoving override.
EOF
)"
```

---

## Verification Checklist

After all tasks land, confirm:

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test:unit` passes (new policy + machine tests, plus existing suite).
- [ ] `pnpm test:smoke` passes.
- [ ] `pnpm dev` — in the playground:
  - Auto mode crossfades trail ↔ orbit_sphere with a burst on orbit exit.
  - Click inside the dotted rect → orbit_rect; click outside → orbit_sphere.
  - Non-auto dropdown entries force that mode regardless of movement.
- [ ] `pnpm dev` — in the real app with an agent running:
  - Travel: trail.
  - Thinking/waiting stationary: orbit_sphere with exit burst on resume.
  - Inspecting a frame: orbit_rect (or orbit_sphere if the rect can't be resolved).
  - click_target activity: burst fires.
- [ ] `grep -rn "emitterModeForPresenceCursor" src/ tests/` → no matches.
