import { callApp, sessionId, getClientName } from './shared/app-client'

// ---------------------------------------------------------------------------
// Presence mapping for canvas verbs
// ---------------------------------------------------------------------------
// Browse verbs already emit presence via handleBrowse — this covers canvas ops.

const VERB_PRESENCE: Record<string, { labelKey: string; surface: string }> = {
  workspace:        { labelKey: 'scan_workspace', surface: 'canvas' },
  selection:        { labelKey: 'scan_workspace', surface: 'canvas' },
  'find-placement': { labelKey: 'scan_workspace', surface: 'canvas' },
  create:           { labelKey: 'create_entity',  surface: 'canvas' },
  update:           { labelKey: 'update_entity',  surface: 'canvas' },
  delete:           { labelKey: 'delete_entity',  surface: 'canvas' },
  upsert:           { labelKey: 'update_entity',  surface: 'canvas' },
  focus:            { labelKey: 'focus_camera',   surface: 'canvas' },
  group:            { labelKey: 'update_entity',  surface: 'canvas' },
  ungroup:          { labelKey: 'update_entity',  surface: 'canvas' },
  link:             { labelKey: 'update_entity',  surface: 'canvas' },
  unlink:           { labelKey: 'update_entity',  surface: 'canvas' },
  breakpoints:      { labelKey: 'create_entity',  surface: 'canvas' },
  annotate:         { labelKey: 'create_entity',  surface: 'canvas' },
  annotations:      { labelKey: 'scan_workspace', surface: 'canvas' },
  annotation:       { labelKey: 'scan_workspace', surface: 'canvas' },
  ack:              { labelKey: 'update_entity',  surface: 'canvas' },
  resolve:          { labelKey: 'update_entity',  surface: 'canvas' },
  dismiss:          { labelKey: 'update_entity',  surface: 'canvas' },
  reply:            { labelKey: 'update_entity',  surface: 'canvas' },
  record:           { labelKey: 'update_entity',  surface: 'canvas' },
}

export function emitPresenceForVerb(verb: string): void {
  const entry = VERB_PRESENCE[verb]
  if (!entry) return
  // Fire-and-forget — don't block the command on presence
  callApp('/session/presence', {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      clientName: getClientName(),
      eventType: 'act',
      surface: entry.surface,
      phase: 'acting',
      labelKey: entry.labelKey,
    }),
  }).catch(() => {})
}
