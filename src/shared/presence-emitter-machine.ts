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
