export type PresenceDebugSide = 'cli' | 'director'

export type PresenceDebugKind =
  | 'cli:emit'
  | 'cli:sync-wait'
  | 'cli:sync-resolve'
  | 'cli:box-resolve'
  | 'dir:apply'
  | 'dir:phase'
  | 'dir:drop'

export interface PresenceDebugEntry {
  id: number
  t: number
  side: PresenceDebugSide
  kind: PresenceDebugKind
  sessionId: string
  label: string
  detail?: string
}
