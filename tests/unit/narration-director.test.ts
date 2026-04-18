import { describe, it, expect, beforeEach } from 'vitest'
import type { NarrationEvent } from '../../src/shared/narration-event'
import {
  configureDirector,
  __resetDirectorForTest,
  __getSessionStateForTest,
  notifyEventPosted,
  tick,
  getNarrationFrames,
  setSplineVizEnabled,
  onPhaseTransition,
  endNarration,
} from '../../src/main/narration/director'
import {
  emitNarration,
  __resetEventBusForTest,
} from '../../src/main/narration/event-bus'

const SESSION = 'sess-1'
const CLIENT = 'agent-A'

class FakeClock {
  constructor(private t = 0) {}
  now = () => this.t
  advance(ms: number) {
    this.t += ms
  }
}

function mkEvent(overrides: Partial<NarrationEvent>): NarrationEvent {
  return {
    version: 1,
    sessionId: SESSION,
    eventId: `evt-${Math.random()}`,
    timestamp: 0,
    verb: 'click',
    idiom: 'atomic',
    waypoints: [{ rect: { x: 100, y: 100, width: 10, height: 10 }, commit: true }],
    ...overrides,
  }
}

describe('NarrationDirector', () => {
  let clock: FakeClock

  beforeEach(() => {
    __resetDirectorForTest()
    __resetEventBusForTest()
    clock = new FakeClock()
    configureDirector({
      clock,
      deriveColor: () => 'hsl(180, 70%, 55%)',
    })
  })

  it('creates a session and emits a frame on first event', () => {
    notifyEventPosted(SESSION, CLIENT)
    emitNarration(mkEvent({}))
    tick()

    const frames = getNarrationFrames()
    expect(frames).toHaveLength(1)
    expect(frames[0].sessionId).toBe(SESSION)
    expect(frames[0].activity).toBe('traveling')
  })

  it('traveling → committing → idle on atomic click', () => {
    notifyEventPosted(SESSION, CLIENT)
    emitNarration(mkEvent({}))

    // First tick: applies event, sets phase = traveling.
    clock.advance(0)
    tick()
    expect(getNarrationFrames()[0].activity).toBe('traveling')

    // Advance clock until cursor reaches waypoint.
    // Speed is base * 1.2 for committing mood; waypoint is ~141 px away.
    // That's about 200 ms.
    for (let i = 0; i < 40; i++) {
      clock.advance(16)
      tick()
    }
    const afterTravel = getNarrationFrames()[0]
    expect(['committing', 'idle']).toContain(afterTravel.activity)
    expect(afterTravel.commitKey).toBeGreaterThan(0)
  })

  it('mid-travel event folds spline from current position', () => {
    notifyEventPosted(SESSION, CLIENT)
    emitNarration(
      mkEvent({
        waypoints: [{ rect: { x: 500, y: 0, width: 10, height: 10 } }],
      }),
    )
    tick()

    // Travel a few steps, capture midpoint.
    for (let i = 0; i < 5; i++) {
      clock.advance(16)
      tick()
    }
    const midpoint = { ...__getSessionStateForTest(SESSION)!.position }
    expect(midpoint.x).toBeGreaterThan(0)
    expect(midpoint.x).toBeLessThan(500)

    // Now emit a new event redirecting to a different point.
    emitNarration(
      mkEvent({
        waypoints: [{ rect: { x: 0, y: 200, width: 10, height: 10 } }],
      }),
    )
    tick()
    const state = __getSessionStateForTest(SESSION)!

    // Spline should have been rebuilt starting from midpoint (within a tick's
    // travel delta, since advance moved the cursor slightly in the same tick).
    expect(Math.abs(state.position.x - midpoint.x)).toBeLessThan(30)
    expect(Math.abs(state.position.y - midpoint.y)).toBeLessThan(30)
  })

  it('scan event with multi-waypoint non-commit passes through waypoints', () => {
    notifyEventPosted(SESSION, CLIENT)
    emitNarration(
      mkEvent({
        verb: 'snapshot',
        idiom: 'scan',
        waypoints: [
          { rect: { x: 100, y: 0, width: 10, height: 10 } },
          { rect: { x: 200, y: 0, width: 10, height: 10 } },
          { rect: { x: 300, y: 0, width: 10, height: 10 } },
        ],
      }),
    )
    tick()

    // Commit counter should never bump for scan.
    for (let i = 0; i < 80; i++) {
      clock.advance(16)
      tick()
    }
    const frame = getNarrationFrames()[0]
    expect(frame.commitKey).toBe(0)
  })

  it('error event bumps errorKey and freezes phase', () => {
    notifyEventPosted(SESSION, CLIENT)
    emitNarration(
      mkEvent({
        errorHint: 'hard_fail',
      }),
    )
    tick()
    const frame = getNarrationFrames()[0]
    expect(frame.errorKey).toBe(1)
    expect(frame.mood).toBe('error')
  })

  it('intent undefined inherits; null clears; string sets', () => {
    notifyEventPosted(SESSION, CLIENT)
    emitNarration(mkEvent({ intent: 'logging in' }))
    tick()
    expect(getNarrationFrames()[0].intent).toBe('logging in')

    emitNarration(mkEvent({}))
    tick()
    expect(getNarrationFrames()[0].intent).toBe('logging in')

    emitNarration(mkEvent({ intent: null }))
    tick()
    expect(getNarrationFrames()[0].intent).toBeNull()
  })

  it('fires a phase-transition event on commit', () => {
    notifyEventPosted(SESSION, CLIENT)
    const transitions: string[] = []
    onPhaseTransition((t) => {
      transitions.push(`${t.previous}->${t.next}${t.commit ? '(commit)' : ''}`)
    })

    emitNarration(mkEvent({}))
    tick()
    for (let i = 0; i < 40; i++) {
      clock.advance(16)
      tick()
    }
    expect(transitions.some((t) => t.includes('(commit)'))).toBe(true)
  })

  it('spline viz is null by default and populated when enabled', () => {
    notifyEventPosted(SESSION, CLIENT)
    emitNarration(mkEvent({}))
    tick()
    expect(getNarrationFrames()[0].splineViz).toBeNull()

    setSplineVizEnabled(true)
    emitNarration(mkEvent({}))
    tick()
    const viz = getNarrationFrames()[0].splineViz
    expect(viz).not.toBeNull()
    expect(viz!.polyline.length).toBeGreaterThan(1)
  })

  it('endNarration transitions to departing', () => {
    notifyEventPosted(SESSION, CLIENT)
    emitNarration(mkEvent({}))
    tick()
    endNarration(SESSION)
    tick()
    const frame = getNarrationFrames()[0]
    expect(frame.activity).toBe('departing')
  })
})
