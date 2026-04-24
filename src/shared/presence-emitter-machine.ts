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

export interface CreateMachineOptions {
  modes: EmitterModes
  transitions: TransitionTable
}

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

function baseIntensity(modes: EmitterModes, mode: EmitterMode): number {
  return modes[mode].baseIntensity
}

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
        targetRect: null,
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

      let state = states.get(resolvedInput.cursorId)
      if (!state) {
        state = { currentMode: resolvedInput.desiredMode, transition: null }
        states.set(resolvedInput.cursorId, state)
      }

      advanceTransition(state, resolvedInput)

      if (state.transition) {
        state.transition.elapsedMs += dtMs
        if (state.transition.elapsedMs >= state.transition.config.durationMs) {
          state.currentMode = state.transition.toMode
          state.transition = null
        }
      }

      emitOutputs(state, resolvedInput, outputs)
    }

    for (const id of states.keys()) {
      if (!seen.has(id)) states.delete(id)
    }

    const bursts = pendingBursts.slice().map((id) => {
      // If id already has a :out or :in suffix (e.g., from exitEffect), keep as-is.
      if (id.endsWith(':out') || id.endsWith(':in')) return id
      // Otherwise, route to the dominant layer based on state.
      const state = states.get(id)
      if (state?.transition) return `${id}:in`
      return id
    })
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
