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
    if (activity === 'acting' && labelKey === 'inspect_page') return 'orbit_sphere' // rect missing, fallback
    if (activity === undefined) return 'orbit_sphere' // playground stationary default
    return 'trail'
  },
}
