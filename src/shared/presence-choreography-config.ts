import type {
  PresenceFormation,
  PresenceTransitionStrategy,
  PresenceVisualState,
} from './presence-visual-state'

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
  movingRadiusScale: number
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

export interface PresenceChoreographyModes {
  trail: TrailParams
  orbit_sphere: OrbitSphereParams
  orbit_rect: OrbitRectParams
  burst: BurstParams
}

export interface PresenceVisualStateParams {
  intensityScale: number
  orbitRadiusScale: number
  orbitAngularVelocityScale: number
}

export interface ChoreographyTransitionConfig {
  durationMs: number
  strategy: PresenceTransitionStrategy
  exitEffect: 'fade' | 'burst' | 'none'
  easing: FadeEasing
}

export type VisualStateEdgeKey = `${PresenceVisualState}->${PresenceVisualState}`

export interface ChoreographyTransitionTable {
  default: ChoreographyTransitionConfig
  edges?: Partial<Record<VisualStateEdgeKey, ChoreographyTransitionConfig>>
  overrideStrategy?: PresenceTransitionStrategy | null
}

export type PresenceVisualStateConfig = Record<
  PresenceVisualState,
  PresenceVisualStateParams
>

export const VISUAL_STATE_FORMATION: Record<PresenceVisualState, PresenceFormation> = {
  idle: 'orbit_sphere',
  moving: 'trail',
  thinking: 'orbit_sphere',
  waiting: 'orbit_sphere',
  inspecting: 'orbit_rect',
}

export const DEFAULT_PRESENCE_CHOREOGRAPHY_MODES: PresenceChoreographyModes = {
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
    movingRadiusScale: 0.2,
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

export const DEFAULT_PRESENCE_VISUAL_STATES: PresenceVisualStateConfig = {
  idle: {
    intensityScale: 1,
    orbitRadiusScale: 1,
    orbitAngularVelocityScale: 0.85,
  },
  moving: {
    intensityScale: 1,
    orbitRadiusScale: 0.2,
    orbitAngularVelocityScale: 1,
  },
  thinking: {
    intensityScale: 1.22,
    orbitRadiusScale: 1.25,
    orbitAngularVelocityScale: 1.15,
  },
  waiting: {
    intensityScale: 0.9,
    orbitRadiusScale: 1.08,
    orbitAngularVelocityScale: -0.75,
  },
  inspecting: {
    intensityScale: 1,
    orbitRadiusScale: 1,
    orbitAngularVelocityScale: 1,
  },
}

export const DEFAULT_PRESENCE_TRANSITIONS: ChoreographyTransitionTable = {
  default: {
    durationMs: 250,
    strategy: 'continuity',
    exitEffect: 'burst',
    easing: 'ease-in-out',
  },
  edges: {
    'idle->moving': {
      durationMs: 220,
      strategy: 'stretch',
      exitEffect: 'none',
      easing: 'ease-in-out',
    },
    'thinking->moving': {
      durationMs: 220,
      strategy: 'stretch',
      exitEffect: 'none',
      easing: 'ease-in-out',
    },
    'waiting->moving': {
      durationMs: 220,
      strategy: 'stretch',
      exitEffect: 'none',
      easing: 'ease-in-out',
    },
    'idle->inspecting': {
      durationMs: 300,
      strategy: 'continuity',
      exitEffect: 'none',
      easing: 'ease-in-out',
    },
    'thinking->inspecting': {
      durationMs: 300,
      strategy: 'continuity',
      exitEffect: 'none',
      easing: 'ease-in-out',
    },
    'waiting->inspecting': {
      durationMs: 300,
      strategy: 'continuity',
      exitEffect: 'none',
      easing: 'ease-in-out',
    },
    'inspecting->inspecting': {
      durationMs: 220,
      strategy: 'direct-morph',
      exitEffect: 'none',
      easing: 'ease-in-out',
    },
  },
}
