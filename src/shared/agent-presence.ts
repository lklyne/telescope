import type { AgentPresenceCursor, PresenceLabelKey } from './types'

export type PresenceEmitterMode = 'trail' | 'orbit_sphere' | 'orbit_rect'

// Maps presence (activity, labelKey) → particle emitter mode. Anchored here
// rather than in the renderer so the mapping is one step away from the data
// model and easy to unit-test. Modes that require extra renderer context
// (orbit_rect needs a resolved target rect) may be downgraded by the caller
// when that context is missing — see AgentCursorLayer.
//
// Note: PresenceEmitterMode does not include 'burst'. Burst is a transient
// triggered by a click transition layered on top of whichever orbit mode
// a cursor was already in.
export function emitterModeForPresenceCursor(
  cursor: Pick<AgentPresenceCursor, 'activity' | 'labelKey'>,
): PresenceEmitterMode {
  if (cursor.activity === 'acting' && cursor.labelKey === 'inspect_page') {
    return 'orbit_rect'
  }
  if (cursor.activity === 'thinking' || cursor.activity === 'waiting') {
    return 'orbit_sphere'
  }
  return 'trail'
}

function labelForKey(
  labelKey: PresenceLabelKey | null,
  targetName?: string | null,
): string | null {
  switch (labelKey) {
    case 'scan_workspace':
      return 'Scanning workspace'
    case 'find_placement':
      return 'Finding placement'
    case 'create_frame':
      return 'Creating frame'
    case 'select_frame':
      return 'Selecting frame'
    case 'attach_frame':
      return 'Attaching to frame'
    case 'inspect_page':
      return 'Inspecting page'
    case 'find_target':
      return targetName ? `Finding ${targetName}` : 'Finding target'
    case 'click_target':
      return targetName ? `Clicking "${targetName}"` : 'Clicking target'
    case 'type_text':
      return targetName ? `Typing in "${targetName}"` : 'Typing text'
    case 'select_option':
      return targetName ? `Selecting "${targetName}"` : 'Selecting option'
    case 'wait_page':
      return targetName ? `Waiting for ${targetName}` : 'Waiting for page'
    case 'scroll_page':
      return 'Scrolling page'
    case 'read_content':
      return targetName ? `Reading ${targetName}` : 'Reading content'
    case 'add_annotation':
      return 'Adding annotation'
    case 'thinking':
      return 'Thinking'
    case 'idle':
    case 'departing':
      return null
    default:
      return null
  }
}

function applyHint(baseLabel: string | null, hint?: string | null, taskLabel?: string | null): string | null {
  const trimmedHint = typeof hint === 'string' ? hint.trim() : ''
  if (trimmedHint) {
    return baseLabel ? `${baseLabel}: ${trimmedHint}` : trimmedHint
  }
  const trimmedTask = typeof taskLabel === 'string' ? taskLabel.trim() : ''
  if (trimmedTask) {
    return baseLabel ? `${baseLabel}: ${trimmedTask}` : trimmedTask
  }
  return baseLabel
}

export function labelForPresenceCursor(
  cursor: Pick<AgentPresenceCursor, 'labelKey' | 'targetName' | 'labelHint' | 'taskLabel'>,
): string | null {
  return applyHint(labelForKey(cursor.labelKey, cursor.targetName), cursor.labelHint, cursor.taskLabel)
}

export function summarizePresenceCursor(
  cursor: Pick<AgentPresenceCursor, 'labelKey' | 'targetName' | 'surface' | 'labelHint' | 'taskLabel'>,
): string | null {
  const label = applyHint(labelForKey(cursor.labelKey, cursor.targetName), cursor.labelHint, cursor.taskLabel)
  if (!label) return null
  return cursor.surface === 'frame' ? `${label} in frame` : `${label} on canvas`
}
