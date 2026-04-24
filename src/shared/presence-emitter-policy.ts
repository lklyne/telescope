import type { PresenceActivity, PresenceLabelKey, PresenceTargetRect } from './types'

export type EmitterMode = 'trail' | 'orbit_sphere' | 'orbit_rect'

// Re-export under the name used internally by the emitter state machine.
// Structurally identical to PresenceTargetRect in types.ts — we alias to
// avoid a cast seam between the presence-cursor data model and the machine.
export type PresenceEmitterRect = PresenceTargetRect

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
    if (activity === 'acting' && labelKey === 'inspect_page') return 'orbit_sphere' // rect missing, fallback
    if (activity === undefined) return 'orbit_sphere' // playground stationary default
    return 'trail'
  },
}
