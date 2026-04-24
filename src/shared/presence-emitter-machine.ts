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
