import type { PresenceVisualPolicyInput, PresenceVisualState } from './presence-visual-state'

export interface PresenceChoreographyPolicy {
  pick(input: PresenceVisualPolicyInput): PresenceVisualState
}

export const defaultPresenceChoreographyPolicy: PresenceChoreographyPolicy = {
  pick: ({ isMoving, targetRect, activity, labelKey }) => {
    if (isMoving) return 'moving'
    if (
      targetRect &&
      (activity === undefined || (activity === 'acting' && labelKey === 'inspect_page'))
    ) {
      return 'inspecting'
    }
    if (activity === 'thinking') return 'thinking'
    if (activity === 'waiting') return 'waiting'
    if (activity === 'acting' && labelKey === 'inspect_page') return 'thinking'
    if (activity === undefined) return 'idle'
    return 'idle'
  },
}
