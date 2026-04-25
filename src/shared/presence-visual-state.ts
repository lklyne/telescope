import type { PresenceActivity, PresenceLabelKey, PresenceTargetRect } from './types'

export type PresenceVisualState =
  | 'idle'
  | 'moving'
  | 'thinking'
  | 'waiting'
  | 'inspecting'

export type PresenceVisualEvent = {
  type: 'click'
  at: { x: number; y: number }
}

export type PresenceFormation = 'trail' | 'orbit_sphere' | 'orbit_rect'

export type PresenceTransitionStrategy =
  | 'default'
  | 'stretch'
  | 'burst'
  | 'crossfade'
  | 'direct-morph'
  | 'continuity'

export type PresenceRect = PresenceTargetRect

export interface PresenceVisualPolicyInput {
  isMoving: boolean
  targetRect: PresenceRect | null
  activity?: PresenceActivity
  labelKey?: PresenceLabelKey | null
}

export interface PresenceChoreographyInput {
  cursorId: string
  x: number
  y: number
  color: string
  visualState: PresenceVisualState
  targetRect: PresenceRect | null
  isMoving: boolean
  events?: PresenceVisualEvent[]
}

export interface PresenceChoreographyLayer {
  layerId: string
  ownerCursorId: string
  x: number
  y: number
  color: string
  formation: PresenceFormation
  visualState: PresenceVisualState
  intensity: number
  targetRect: PresenceRect | null
  isMoving: boolean
  transitionProgress: number
  transitionStrategy: PresenceTransitionStrategy
  orbitRadiusScale: number
  orbitAngularVelocityScale: number
}

export interface PresenceChoreographyFrame {
  layers: PresenceChoreographyLayer[]
  events: Array<{
    type: 'burst'
    layerId: string
    at: { x: number; y: number }
  }>
}
