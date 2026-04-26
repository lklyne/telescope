# Presence Emitter State Machine

**Date:** 2026-04-24
**Status:** Superseded on 2026-04-25 by
`docs/superpowers/plans/2026-04-25-presence-choreography-refactor.md`.

The emitter-machine modules described in this document were removed in favor of
the semantic choreography model:

- `src/shared/presence-visual-state.ts`
- `src/shared/presence-choreography-config.ts`
- `src/shared/presence-choreography-policy.ts`
- `src/shared/presence-choreographer.ts`
- `src/renderer/shared/usePresenceChoreography.ts`

## Purpose

Replace the existing instant, activity-driven emitter-mode mapping with a
state machine that:

- Owns transitions between emitter modes (trail ↔ orbit_sphere ↔ orbit_rect)
- Crossfades spawn rates and punctuates orbit-exits with bursts, so mode
  changes read as deliberate visual events rather than pops
- Holds per-mode parameters (lifetimes, speeds, radii) as configurable
  config rather than hardcoded constants
- Picks modes from live cursor state (moving / stationary / over a target
  rect) via a pluggable policy, so the same machine powers both the
  production `AgentCursorLayer` and the playground's "auto" mode
- Keeps the shape extensible for future modes (e.g. `orbit_capsule`,
  `spiral`) without touching the machine's internals

## Non-goals

- Per-particle morph between modes (converting existing particles' behavior
  in place). Out of scope for v1; the crossfade+burst model is the
  transition strategy for every edge.
- Same-mode parameter tweening (e.g. orbit radius animating 8→20 during a
  focus handoff). The API is shaped so this can be added later, but it's
  not built now.
- Mode-specific state beyond what the particle system already tracks. The
  machine is the conductor; particles remain frozen at spawn.

## Architecture

### File layout

```
src/shared/presence-emitter-machine.ts    Pure state machine + types (testable)
src/shared/presence-emitter-config.ts     Default mode params + transition table
src/renderer/shared/usePresenceEmitter.ts React hook: RAF tick, state ref, input diff
src/renderer/shared/PresenceParticleTrail.tsx  Accepts per-mode params as props
```

The machine is pure (no React, no WebGPU) so unit tests can drive it with
synthetic inputs and a manual clock. The hook is the React glue layer. The
particle component stops owning per-mode constants; they become props that
the hook feeds through.

### Core types

```ts
export type EmitterMode = 'trail' | 'orbit_sphere' | 'orbit_rect'

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
  baseIntensity: number       // spawn rate when mode is fully active (0..1)
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
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
}

export interface TransitionTable {
  default: TransitionConfig
  edges?: Partial<Record<`${EmitterMode}->${EmitterMode}`, TransitionConfig>>
}
```

### Machine inputs and outputs

Inputs are produced once per frame by the caller (the hook), one entry per
cursor:

```ts
export interface Rect {
  x: number; y: number; width: number; height: number
}

export interface MachineCursorInput {
  cursorId: string
  x: number
  y: number
  color: string
  desiredMode: EmitterMode       // policy-resolved by caller
  targetRect: Rect | null        // required when desiredMode is 'orbit_rect'
  isMoving: boolean              // authoritative; machine does not second-guess
}
```

Outputs are fed directly to `PresenceParticleTrail`'s `cursors` prop. A
cursor in a stable state produces one output; a cursor mid-transition
produces two outputs — one for the outgoing mode and one for the incoming
mode — with crossfaded `intensity`.

```ts
export interface MachineCursorOutput {
  id: string                     // cursorId, or `${cursorId}:out`/`:in` during transition
  x: number; y: number; color: string
  mode: EmitterMode
  intensity: number              // 0..1, pre-scaled by transition progress
  targetRect: Rect | null
}

export interface PresenceEmitterMachine {
  update(inputs: MachineCursorInput[], dtMs: number): MachineCursorOutput[]
  triggerBurst(cursorId: string): void
}

export function createPresenceEmitterMachine(opts: {
  modes: EmitterModes
  transitions: TransitionTable
  autoPolicy: AutoModePolicy
  stationaryDebounceMs?: number  // default 250
}): PresenceEmitterMachine
```

### Auto mode as policy

"Auto" is not a fourth emitter mode. It's the default policy the caller
uses to map raw signals (movement, activity, label, target rect) to a
`desiredMode`. The machine itself only sees the resolved `desiredMode` +
transition machinery — it does not know why a mode was chosen.

```ts
export interface AutoModePolicyInput {
  isMoving: boolean
  targetRect: Rect | null
  activity?: PresenceActivity
  labelKey?: PresenceLabelKey | null
}

export interface AutoModePolicy {
  pick(input: AutoModePolicyInput): EmitterMode
}

export const defaultAutoPolicy: AutoModePolicy = {
  pick: ({ isMoving, targetRect, activity, labelKey }) => {
    if (isMoving) return 'trail'
    if (targetRect && activity === 'acting' && labelKey === 'inspect_page') {
      return 'orbit_rect'
    }
    if (activity === 'thinking' || activity === 'waiting') return 'orbit_sphere'
    return 'trail'
  }
}
```

- `AgentCursorLayer` calls `defaultAutoPolicy.pick(...)` per cursor.
- `PresencePlayground` calls a simpler policy (moving → trail; stationary
  + over rect → orbit_rect; stationary → orbit_sphere) OR passes a manual
  override as `desiredMode` when the user picks a specific mode from the
  dropdown.
- Adding a future mode means extending `EmitterMode`, adding its params,
  and updating the policy. The machine's transition logic is untouched.

The existing `emitterModeForPresenceCursor` function is superseded by
`defaultAutoPolicy.pick`. Its unit tests port over to
`tests/unit/presence-emitter-policy.test.ts`.

### Transitions

Per-cursor machine state:

```ts
interface CursorState {
  currentMode: EmitterMode
  transition: {
    fromMode: EmitterMode
    toMode: EmitterMode
    elapsedMs: number
    config: TransitionConfig
  } | null
}
```

On each `update(inputs, dtMs)`:

1. For each input cursor:
   - If `desiredMode !== state.currentMode` and no active transition:
     start a transition. Resolve `config` from
     `transitions.edges[fromMode->toMode]` or `transitions.default`.
     If `config.exitEffect === 'burst'`, record a side-effect to fire
     `triggerBurst(cursorId)` on the current particle controls.
   - If `desiredMode` changes mid-transition: snap to `desiredMode` as
     the new `toMode`, keep elapsed progress (prevents oscillation).
   - Advance `transition.elapsedMs += dtMs`. When `elapsedMs >=
     durationMs`, collapse: `currentMode = toMode`, `transition = null`.
2. Emit outputs:
   - Stable: one entry with `mode = currentMode`,
     `intensity = modes[currentMode].baseIntensity`.
   - Transitioning: two entries,
     - `id: '${cursorId}:out'`, `mode: fromMode`,
       `intensity: modes[fromMode].baseIntensity * (1 - eased(progress))`
     - `id: '${cursorId}:in'`,  `mode: toMode`,
       `intensity: modes[toMode].baseIntensity * eased(progress)`

Because particles in flight are frozen at spawn, the intensity crossfade
on outgoing particles only affects *new* spawns, and they stop cleanly as
intensity → 0. Existing particles age out on their own lifetime clock.

Id suffixing ensures the particle system treats the two transition layers
as independent cursors (so e.g. the orbit angle accumulator doesn't get
shared between them). When the transition collapses, the id returns to
the bare `cursorId`.

### Burst routing

Burst remains a one-shot imperative, but routed through the machine:

- `machine.triggerBurst(cursorId)` enqueues a pending burst for that
  cursor.
- On the next `update()`, the machine applies it to whichever layer is
  currently the "dominant" output (the `:in` layer during transition,
  or the single layer otherwise) via the existing
  `PresenceParticleControls.triggerBurst(outputId)` path.
- Transition-triggered bursts (from `exitEffect: 'burst'`) are
  internally queued the same way so both paths share one code path.

### Stationary detection

The machine expects `isMoving` as an authoritative input — it does not
compute velocity internally. The hook computes `isMoving` from cursor
position samples:

- Track `lastPos` + `lastMoveAtMs` per cursor.
- `isMoving = now - lastMoveAtMs < stationaryDebounceMs` where a position
  delta over `~2 px` counts as movement.
- Callers that already know they're moving (playground's `isTraveling`
  flag, production's `useAnimatedCursors` tween state) can short-circuit
  by passing an explicit `isMoving` into the hook.

### Mode-param transitions (deferred)

Param tweens within the same mode (e.g. orbit radius animating 8 → 20)
are out of v1 scope. The shape of `EmitterModes` being per-mode param
structs means adding this later is localized: the hook would hold a
`targetParams` and a `currentParams` per mode, lerping across a window
when `targetParams` changes, and pass `currentParams` to the particle
system.

### Playground changes

- Dotted demo rect **always visible** (currently gated on
  `mode === 'orbit_rect'`).
- `EmitterModeSelector` dropdown options become:
  `auto (default) | trail | orbit_sphere | orbit_rect`. Picking `auto`
  hands over to the policy; picking a specific mode forces
  `desiredMode` to that value.
- Click inside the rect: cursor tweens there (existing spline path);
  once stationary, policy picks `orbit_rect`.
- Click outside the rect: `targetRect = null`; once stationary, policy
  picks `orbit_sphere`.
- Burst button continues to call `machine.triggerBurst('playground')`.

### Production wiring

- `AgentCursorLayer` drops the direct `emitterModeForPresenceCursor`
  call. It instantiates the machine via `usePresenceEmitter(...)`,
  supplies default mode params + transition table + `defaultAutoPolicy`.
- Per-cursor inputs: `{cursorId, x, y, color, desiredMode, targetRect,
  isMoving}` where `desiredMode = defaultAutoPolicy.pick(...)`,
  `targetRect = resolveTargetRectScreen(...)` (existing),
  `isMoving = isAnimating` (from `useAnimatedCursors`).
- Click-to-burst handler still fires, now via
  `machine.triggerBurst(cursorId)`.

## Data flow

```
AgentCursorLayer / PresencePlayground
   │
   │  per frame: [{cursorId, x, y, activity, labelKey, isMoving, targetRect}]
   ▼
defaultAutoPolicy.pick(...) ─────────────── derives desiredMode per cursor
   │
   │  [{cursorId, x, y, color, desiredMode, targetRect, isMoving, burstRequested?}]
   ▼
PresenceEmitterMachine.update(inputs, dtMs)
   │
   │  0..2 outputs per input, depending on transition state
   ▼
PresenceParticleTrail (cursors prop)
   │
   ▼
WebGPU particle system
```

## Error handling

- `desiredMode === 'orbit_rect'` with `targetRect == null`: the machine
  downgrades to `orbit_sphere` at the boundary — same as today's
  `AgentCursorLayer` behavior.
- Id churn during transitions is invisible to callers: the hook diff
  doesn't affect input shape, and the particle system only needs ids to
  be stable *within* each tick.
- Missing params in an `EmitterModes` config: TypeScript enforces the
  struct shape; runtime provides `DEFAULT_EMITTER_MODES` from
  `presence-emitter-config.ts` which callers spread-override.

## Testing

Unit (`tests/unit/`):

- `presence-emitter-machine.test.ts` — manual-clock tests for:
  - Stable state: one output per cursor with base intensity.
  - Desired-mode change triggers transition; elapsed progression yields
    two outputs with correct crossfaded intensities.
  - Mid-transition desired-mode change retargets `toMode` without
    resetting elapsed.
  - `exitEffect: 'burst'` enqueues a burst for the cursor.
  - Transition collapses at `elapsedMs >= durationMs`.
  - Missing `targetRect` on `orbit_rect` downgrades to `orbit_sphere`.
- `presence-emitter-policy.test.ts` — porting existing
  `emitterModeForPresenceCursor` tests to `defaultAutoPolicy.pick`,
  plus new cases for `isMoving` override.

Integration: the playground *is* the integration test. Manual smoke:
- Move cursor → trail.
- Stop → trail fades out, orbit_sphere fades in (burst at exit).
- Click rect → tween in → orbit_sphere → orbit_rect on arrival.
- Click outside rect → tween out → orbit_rect → orbit_sphere (burst at exit).
- Toggle dropdown to manual mode → machine honors override.

No new smoke tests; the existing presence smoke covers
`AgentCursorLayer` rendering.

## Migration

1. Land machine + policy + config (pure modules + unit tests).
2. Land hook + extend `PresenceParticleTrail` props (per-mode param
   props); keep existing constants as the default config so behavior
   is unchanged.
3. Switch playground over; verify by hand.
4. Switch `AgentCursorLayer` over; delete `emitterModeForPresenceCursor`
   and its test; keep the ported tests under the new name.
5. Smoke test `pnpm test:smoke` to confirm no renderer regressions.

Each step is independently reviewable and revertable.

## Open questions

None at spec-time. Deferred items (param tweens, per-particle morph
transitions) are called out in Non-goals.
