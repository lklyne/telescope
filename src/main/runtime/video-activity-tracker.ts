import { getPresenceCursors, onPresenceCursorsChanged } from '../app-control-server'
import { PRESENCE_THINKING_DELAY_MS } from '../../shared/presence-timing'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivitySegment {
  /** Segment type: 'active' contains meaningful content, 'idle' is dead time. */
  type: 'active' | 'idle'
  /** Start time relative to recording start (seconds). */
  startTime: number
  /** End time relative to recording start (seconds). */
  endTime: number
  /** Duration in seconds. */
  duration: number
}

interface ActivityEvent {
  timestamp: number
  activity: string
  labelKey: string | null
}

// ---------------------------------------------------------------------------
// VideoActivityTracker
//
// Subscribes to presence cursor changes and builds a timeline of active vs
// idle segments. An "idle" segment starts when all agent cursors have been
// idle/thinking for longer than `idleThresholdMs`. The timeline is used for
// post-process trimming of recorded video.
// ---------------------------------------------------------------------------

export class VideoActivityTracker {
  private events: ActivityEvent[] = []
  private unsubscribe: (() => void) | null = null
  private recordingStartedAt = 0
  private idleThresholdMs: number

  constructor(idleThresholdMs = PRESENCE_THINKING_DELAY_MS) {
    this.idleThresholdMs = idleThresholdMs
  }

  start(): void {
    this.recordingStartedAt = Date.now()
    this.events = []

    // Record initial state.
    this.sampleActivity()

    // Subscribe to presence changes.
    this.unsubscribe = onPresenceCursorsChanged(() => {
      this.sampleActivity()
    })
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    // Record final event.
    this.events.push({
      timestamp: Date.now(),
      activity: 'recording_end',
      labelKey: null,
    })
  }

  /** Build segments from recorded activity events. */
  getSegments(): ActivitySegment[] {
    if (this.events.length === 0) return []

    const segments: ActivitySegment[] = []
    let currentType: 'active' | 'idle' = 'active'
    let segmentStart = this.recordingStartedAt
    let idleSince: number | null = null

    for (const event of this.events) {
      const isIdle = event.activity === 'idle' || event.activity === 'thinking'

      if (isIdle && idleSince === null) {
        idleSince = event.timestamp
      } else if (!isIdle) {
        // Transitioned to active.
        if (idleSince !== null && currentType === 'active') {
          // Check if idle duration exceeded threshold — if so, split into
          // an active segment ending at idle start, and an idle segment.
          const idleDuration = event.timestamp - idleSince
          if (idleDuration >= this.idleThresholdMs) {
            // Close the active segment at idle start.
            const activeEnd = (idleSince - this.recordingStartedAt) / 1000
            const activeStart = (segmentStart - this.recordingStartedAt) / 1000
            if (activeEnd > activeStart) {
              segments.push({
                type: 'active',
                startTime: activeStart,
                endTime: activeEnd,
                duration: activeEnd - activeStart,
              })
            }
            // Add the idle segment.
            const idleEnd = (event.timestamp - this.recordingStartedAt) / 1000
            segments.push({
              type: 'idle',
              startTime: activeEnd,
              endTime: idleEnd,
              duration: idleEnd - activeEnd,
            })
            segmentStart = event.timestamp
            currentType = 'active'
          }
        }
        idleSince = null
      }
    }

    // Close the final segment.
    const lastEvent = this.events[this.events.length - 1]
    const finalEnd = (lastEvent.timestamp - this.recordingStartedAt) / 1000
    const finalStart = (segmentStart - this.recordingStartedAt) / 1000
    if (finalEnd > finalStart) {
      // If we ended while idle and idle exceeded threshold, mark as idle.
      const endedIdle =
        idleSince !== null && lastEvent.timestamp - idleSince >= this.idleThresholdMs
      segments.push({
        type: endedIdle ? 'idle' : 'active',
        startTime: finalStart,
        endTime: finalEnd,
        duration: finalEnd - finalStart,
      })
    }

    return segments
  }

  private sampleActivity(): void {
    const cursors = getPresenceCursors()
    // Use the most active cursor's state.
    let dominantActivity = 'idle'
    let dominantLabel: string | null = null
    for (const cursor of cursors) {
      if (cursor.activity === 'acting' || cursor.activity === 'traveling') {
        dominantActivity = cursor.activity
        dominantLabel = cursor.labelKey
        break
      }
      if (cursor.activity === 'waiting' && dominantActivity !== 'acting') {
        dominantActivity = cursor.activity
        dominantLabel = cursor.labelKey
      }
      if (cursor.activity === 'thinking' && dominantActivity === 'idle') {
        dominantActivity = cursor.activity
        dominantLabel = cursor.labelKey
      }
    }

    this.events.push({
      timestamp: Date.now(),
      activity: dominantActivity,
      labelKey: dominantLabel,
    })
  }
}
