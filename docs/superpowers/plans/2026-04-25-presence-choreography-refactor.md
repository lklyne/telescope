# Presence Choreography Refactor — Implementation Plan

**Date:** 2026-04-25
**Status:** Complete — implementation checkpoint

## Current Checkpoint

Last updated: 2026-04-25.

Implemented and verified:

- Shared semantic contract:
  `PresenceVisualState`, `PresenceVisualEvent`, screen-space choreography
  inputs, renderer-facing layers, and one-shot event queue.
- Shared choreography config:
  preserved existing trail/orbit/rect/burst visual defaults, added visual-state
  variants for idle/thinking/waiting, and added transition strategy names plus
  a playground override.
- Shared policy:
  maps raw presence activity/label/rect/movement into semantic visual states.
- Shared choreographer:
  tracks per-cursor visual state, transition progress, target rect changes, and
  click events without exposing legacy `:out` / `:in` ids.
- Renderer hook:
  `usePresenceChoreography` owns RAF ticking, movement debounce, controller
  instance, and pushes declarative layers/events into the particle renderer.
- Playground:
  auto mode is preserved, manual controls now use semantic states
  (`idle`, `moving`, `thinking`, `waiting`, `inspecting`), click event
  simulation is available, and transition strategy override controls exist.
- Production integration:
  `AgentCursorLayer` resolves screen-space cursor anchors and target rects,
  routes inputs through the shared choreographer, preserves cursor icons/labels,
  and removes the DOM click ripple.
- Particle renderer:
  click feedback now coalesces current particles toward the cursor tip before
  bursting; idle/thinking/waiting variants can alter orbit radius, intensity,
  and spin direction/speed while preserving the existing material. Orbit
  formations seed a stable particle population on the shell/rect, then rotate
  those particles instead of continuously emitting from the center and decaying.
- Unit coverage:
  `presence-choreography-policy.test.ts` and
  `presence-choreographer.test.ts`.

Verified:

- `pnpm typecheck`
- `pnpm test:unit`

Final pass:

- Added playground target-rect presets so rect-to-rect reflow can be exercised
  directly without live agent sessions.
- Removed the superseded emitter-machine modules, hook, and mode-oriented unit
  tests.
- Made production target-rect screen math shared between particle choreography
  and `TargetHalo`, so their alignment uses one transform.
- Fixed orbit-family rendering to use seeded, stable particles instead of the
  legacy center-emission lifecycle.
- Marked the 2026-04-24 emitter-machine plan/spec as superseded by this
  choreography model.
- Optional future work is visual feel tuning only; the implementation path is
  now the choreography controller.

## Goal

Refactor agent presence particles from a low-level emitter-mode switcher into a
unified choreography system.

The product goal is still one coherent presence language: moving, idle,
thinking, waiting, inspecting, and clicking should feel like related behaviors
of the same living cursor. The implementation should not require every behavior
to be forced through one brittle emitter abstraction. Unity should come from the
semantic controller, shared timing, transition rules, and visual material.

## Product Decisions

- Preserve the current particle material: shape, glow, color treatment, density,
  and overall visual style are not on the table for redesign.
- The organic motion/noise model may change if it helps the system feel more
  alive, fluid, and natural.
- Playground auto mode is first-class. It is the primary place to tune and
  observe state changes without needing live agent sessions.
- Production and playground must use the same choreography/controller code.
- Choreography and rendering operate in screen space. Callers resolve canvas
  pan/zoom/frame geometry before passing inputs in.
- Particle continuity is preferred across transitions, but not a hard invariant.
  Transition strategies should be swappable so we can compare continuity,
  stretch, burst, crossfade, and direct morph styles.
- Idle should be alive but quiet: particles form and maintain a small rotating
  sphere rather than continuously emitting from a center and decaying.
- Thinking, waiting, and idle may share the orbit-family behavior, with animated
  differences in size, speed, intensity, or direction.
- Inspecting uses the exact DOM target rect as its source of truth.
- Inspecting target changes should smoothly reflow particles from the old rect
  to the new rect.
- Click feedback is an event, not a durable mode. Existing particles should
  coalesce toward the cursor tip and then burst from that point. The DOM click
  ripple can be removed after particle click feedback covers the cue.

## Target Architecture

### Semantic Layer

Create a small visual-state API that product code can understand without
knowing particle render modes:

```ts
export type PresenceVisualState =
  | 'idle'
  | 'moving'
  | 'thinking'
  | 'waiting'
  | 'inspecting'

export type PresenceVisualEvent =
  | { type: 'click'; at: { x: number; y: number } }
```

Production maps existing `AgentPresenceCursor.activity`, `labelKey`,
`targetRect`, and movement information into this derived state. Keep this
mapping simple; do not leak old names like `acting` into the choreography API
unless they remain useful as raw input.

### Choreography Layer

Replace the current emitter-machine output model with a choreography model.
Instead of emitting fake particle cursor ids such as `c1:out` and `c1:in`, the
controller should track per-cursor visual state, transition progress, targets,
and queued events.

The controller chooses render behavior internally:

- `moving` → trail-family behavior
- `idle` → small orbit sphere
- `thinking` / `waiting` → orbit-family variants
- `inspecting` → rect orbit around the resolved DOM rect
- `click` event → coalesce to cursor tip, then burst

Transition strategy should be configured per edge, with a playground global
override for testing:

- `sphere -> trail`: stretch into trail
- `sphere -> rect`: fly/reflow particles from sphere positions to rect orbit
- `rect -> sphere`: preserve continuity where practical
- `rect -> trail`: preserve continuity where practical, or stretch into trail
- `rect -> rect`: smooth reflow from old target rect to new target rect
- `click`: coalesce current particles to cursor tip, then burst

### Rendering Layer

Prefer one particle system if it stays clean and performant for up to eight
simultaneous cursors. Multiple internal passes or pools are acceptable if they
make the system substantially easier to reason about without a meaningful
performance hit.

React Three Fiber is allowed if it gives us a cleaner boundary. Do not do a
straight port of the existing low-level pool just to change frameworks. Use R3F
only if the final renderer becomes easier to own, tune, and debug.

## Proposed File Shape

Names are provisional; adjust during implementation if the codebase suggests a
cleaner shape.

- `src/shared/presence-visual-state.ts`
  - `PresenceVisualState`
  - `PresenceVisualEvent`
  - screen-space input/output types
- `src/shared/presence-choreography-config.ts`
  - state params
  - transition strategy table
  - playground override helpers
- `src/shared/presence-choreography-policy.ts`
  - maps raw presence cursor data + movement + resolved rect into
    `PresenceVisualState`
- `src/shared/presence-choreographer.ts`
  - pure or mostly pure per-cursor choreography state
  - transition/event scheduling
  - render instructions or renderer state snapshots
- `src/renderer/shared/usePresenceChoreography.ts`
  - React/RAF glue
  - owns controller instance
  - pushes screen-space cursor inputs to the renderer
- `src/renderer/shared/PresenceParticleTrail.tsx`
  - either evolves into the new renderer or is split into a clearer
    `PresenceParticleSystem`
- `src/renderer/debug/PresencePlayground.tsx`
  - first-class tuning lab
  - auto mode preserved
  - transition strategy override controls
  - state/event simulation controls
- `src/renderer/canvas-bg/AgentCursorLayer.tsx`
  - maps production presence data into screen-space visual inputs
  - does not choose low-level render modes

## Phase 1: Lock the Choreography Contract

- [x] Define `PresenceVisualState`, `PresenceVisualEvent`, and screen-space
      cursor input types.
- [x] Define the minimum renderer-facing output shape. Prefer a shape that
      describes particle formations, targets, transition progress, and events
      without exposing implementation ids like `:out` and `:in`.
- [x] Decide whether the first renderer output is a declarative snapshot or an
      imperative command stream. Default preference: snapshot for durable state,
      event queue for one-shot events like click.
- [x] Map current production cursor fields into the new visual state with the
      simplest policy that preserves behavior.
- [x] Keep existing visual constants as defaults; do not retune appearance in
      this phase.

## Phase 2: Upgrade the Playground First

- [x] Preserve auto mode and make it the default test path.
- [x] Add transition-strategy controls:
      `default`, `stretch`, `burst`, `crossfade`, `direct morph`, and
      `continuity` if useful.
- [x] Add state simulation controls for idle, moving, thinking, waiting,
      inspecting, and click event.
- [x] Add target-rect controls or interactions that make rect-to-rect reflow
      easy to observe.
- [x] Ensure playground and production both consume the same controller.

## Phase 3: Renderer Design Spike

Run a short implementation spike before committing to vanilla Three versus R3F.
The spike should answer:

- [x] Can the current WebGPU/TSL particle pool support continuity transitions
      without fake cursor ids and fragile slot routing?
- [x] Would an R3F wrapper materially simplify lifecycle, RAF, controls, and
      resource cleanup while keeping the TSL compute path intact?
- [x] Is one particle pool still the cleanest model, or do internal passes for
      trail/orbit/burst make the code clearer with acceptable performance?
- [x] Can click coalesce-and-burst be represented cleanly in the chosen model?
- [x] Can rect-to-rect reflow be represented cleanly in the chosen model?

Exit this phase with a short note in this plan or a companion spec explaining
the chosen renderer shape.

Renderer spike note: the current vanilla Three/WebGPU/TSL pool remains the
right renderer for now. R3F would not remove the hard part, which is compute
particle state and slot continuity. One pool is still acceptable for up to the
current eight-cursor target; click feedback is represented by a short coalesce
particle mode followed by burst conversion. Rect-to-rect uses a direct-morph
layer strategy and live target rect uniforms, with playground presets for quick
manual validation.

## Phase 4: Implement Continuity-Oriented Transitions

- [x] Idle/thinking/waiting orbit-family behavior:
      maintain a stable particle population around a small sphere, with subtle
      animated differences between states.
- [x] Sphere-to-trail:
      particles stretch into the trail as the cursor moves.
- [x] Sphere-to-rect:
      particles launch/reflow from current sphere positions to the rect and
      then orbit around the exact target bounds.
- [x] Rect-to-rect:
      particles smoothly reflow from old bounds to new bounds.
- [x] Rect-to-sphere and rect-to-trail:
      preserve continuity where practical; keep strategy override available if
      this feels too busy.
- [x] Click event:
      current particles coalesce to cursor tip, then burst from that point.
- [x] Remove or disable the DOM click ripple once particle click feedback is
      sufficient.

## Phase 5: Production Integration

- [x] Keep `AgentCursorLayer` responsible for resolving cursor tip, particle
      anchor, and target rect into screen space.
- [x] Route production inputs through the shared choreography controller.
- [x] Preserve current cursor icon and label behavior unless explicitly changed.
- [x] Confirm target rects still line up with `TargetHalo`.
- [x] Confirm up to eight cursors can animate without slot stealing, visual
      snapping, or runaway particle counts.

## Phase 6: Cleanup

- [x] Delete superseded emitter-machine APIs once the new controller owns the
      behavior.
- [x] Remove old mode-oriented tests that over-spec implementation details.
- [x] Keep or add focused unit tests only for stable policy/config behavior.
- [x] Keep visual validation centered on the playground until the feel settles.
- [x] Update docs/specs to describe the final choreography model.

## Validation

Starting point:

- Playground visual validation in auto mode.
- Manual state/event controls in the playground.
- `pnpm typecheck`
- `pnpm test:unit`

Before merging runtime integration:

- `pnpm test:smoke`

Visual checks to perform in the playground:

- Idle forms a small stable orbit sphere and stays alive without trail decay.
- Moving stretches sphere particles into a trail.
- Thinking/waiting feel related to idle but visibly alive.
- Inspecting moves particles onto the exact target rect.
- Rect target changes reflow smoothly.
- Click coalesces particles to the cursor tip and bursts.
- Global strategy override can visibly change transition behavior in auto mode.

## Non-Goals

- Do not redesign particle shape, glow, color treatment, or density.
- Do not change persistence, IPC, workspace state, or main-process behavior.
- Do not make production callers choose low-level transition strategies.
- Do not require physical particle continuity for every edge if a simpler
  strategy looks better.
- Do not introduce R3F unless it improves the final renderer boundary, not just
  the framework label.

## Open Questions

- Should transition strategy names be user-facing in debug UI only, or also
  documented as product choreography vocabulary?
- Should idle/thinking/waiting differences be mostly size/speed/intensity, or
  should rotation direction/noise pattern also encode state?
- How long should click coalescence last before the burst?
- Does the renderer need a fallback path for unavailable WebGPU, or is that out
  of scope for this refactor?
