/**
 * Debug timeline — a time-stamped log of CLI dispatches and director activity
 * so we can visually confirm the queue system's behavior side-by-side.
 *
 * Left (cli) column: verb emitted, sync wait entered, sync wait resolved.
 * Right (director) column: event applied to spline, phase transitions, queue
 * overflow drops.
 *
 * The timeline is maintained as a ring buffer in main; the debug renderer
 * fetches a snapshot on mount and subscribes to appends.
 */

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
