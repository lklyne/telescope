import { describe, it, expect, beforeEach } from 'vitest'
import type { AgentAction } from '../../src/shared/agent-action'
import {
  configureDirector,
  __resetDirectorForTest,
  __getSessionStateForTest,
  notifyEventPosted,
  tick,
  getCursorFrames,
  setSplineVizEnabled,
  onPhaseTransition,
  endPresenceSession,
  waitForNextCommit,
} from '../../src/main/presence/director'
import {
  emitAction,
  __resetEventBusForTest,
} from '../../src/main/presence/event-bus'

const SESSION = 'sess-1'
const CLIENT = 'agent-A'

class FakeClock {
  constructor(private t = 0) {}
  now = () => this.t
  advance(ms: number) {
    this.t += ms
  }
}

function mkEvent(overrides: Partial<AgentAction>): AgentAction {
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

describe('CursorDirector', () => {
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
    emitAction(mkEvent({}))
    tick()

    const frames = getCursorFrames()
    expect(frames).toHaveLength(1)
    expect(frames[0].sessionId).toBe(SESSION)
    expect(frames[0].activity).toBe('traveling')
  })

  it('traveling → committing → idle on atomic click', () => {
    notifyEventPosted(SESSION, CLIENT)
    emitAction(mkEvent({}))

    // First tick: applies event, sets phase = traveling.
    clock.advance(0)
    tick()
    expect(getCursorFrames()[0].activity).toBe('traveling')

    // Advance clock until cursor reaches waypoint.
    // Speed is base * 1.2 for committing mood; waypoint is ~141 px away.
    // That's about 200 ms.
    for (let i = 0; i < 40; i++) {
      clock.advance(16)
      tick()
    }
    const afterTravel = getCursorFrames()[0]
    expect(['committing', 'idle']).toContain(afterTravel.activity)
    expect(afterTravel.commitKey).toBeGreaterThan(0)
  })

  it('mid-travel event folds spline from current position', () => {
    notifyEventPosted(SESSION, CLIENT)
    emitAction(
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
    emitAction(
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
    emitAction(
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
    const frame = getCursorFrames()[0]
    expect(frame.commitKey).toBe(0)
  })

  it('error event bumps errorKey and freezes phase', () => {
    notifyEventPosted(SESSION, CLIENT)
    emitAction(
      mkEvent({
        errorHint: 'hard_fail',
      }),
    )
    tick()
    const frame = getCursorFrames()[0]
    expect(frame.errorKey).toBe(1)
    expect(frame.mood).toBe('error')
  })

  it('intent undefined inherits; null clears; string sets', () => {
    notifyEventPosted(SESSION, CLIENT)
    emitAction(mkEvent({ intent: 'logging in' }))
    tick()
    expect(getCursorFrames()[0].intent).toBe('logging in')

    emitAction(mkEvent({}))
    tick()
    expect(getCursorFrames()[0].intent).toBe('logging in')

    emitAction(mkEvent({ intent: null }))
    tick()
    expect(getCursorFrames()[0].intent).toBeNull()
  })

  it('fires a phase-transition event on commit', () => {
    notifyEventPosted(SESSION, CLIENT)
    const transitions: string[] = []
    onPhaseTransition((t) => {
      transitions.push(`${t.previous}->${t.next}${t.commit ? '(commit)' : ''}`)
    })

    emitAction(mkEvent({}))
    tick()
    for (let i = 0; i < 40; i++) {
      clock.advance(16)
      tick()
    }
    expect(transitions.some((t) => t.includes('(commit)'))).toBe(true)
  })

  it('spline viz is null by default and populated when enabled', () => {
    notifyEventPosted(SESSION, CLIENT)
    emitAction(mkEvent({}))
    tick()
    expect(getCursorFrames()[0].splineViz).toBeNull()

    setSplineVizEnabled(true)
    emitAction(mkEvent({}))
    tick()
    const viz = getCursorFrames()[0].splineViz
    expect(viz).not.toBeNull()
    expect(viz!.polyline.length).toBeGreaterThan(1)
  })

  it('waitForNextCommit resolves on the next commit', async () => {
    notifyEventPosted(SESSION, CLIENT)
    emitAction(mkEvent({}))
    tick()

    // Kick off a wait with a generous cap.
    const pending = waitForNextCommit(SESSION, 2_000)

    // Advance the fake clock until the cursor arrives at its commit waypoint.
    for (let i = 0; i < 40; i++) {
      clock.advance(16)
      tick()
    }

    // The wait resolves with 'arrived' once the commit phase fires.
    await expect(pending).resolves.toBe('arrived')
  })

  it('waitForNextCommit caps at the requested timeout', async () => {
    notifyEventPosted(SESSION, CLIENT)
    emitAction(
      mkEvent({
        // Long-distance waypoint so travel time exceeds the cap.
        waypoints: [{ rect: { x: 5_000, y: 5_000, width: 10, height: 10 }, commit: true }],
      }),
    )
    tick()

    // Cap is real time here (setTimeout, not fake-clock driven).
    const arrival = await waitForNextCommit(SESSION, 20)
    expect(arrival).toBe('capped')
  })

  it('waitForNextCommit returns no-session for unknown ids', async () => {
    const arrival = await waitForNextCommit('not-a-session', 1_000)
    expect(arrival).toBe('no-session')
  })

  it('endPresenceSession transitions to departing', () => {
    notifyEventPosted(SESSION, CLIENT)
    emitAction(mkEvent({}))
    tick()
    endPresenceSession(SESSION)
    tick()
    const frame = getCursorFrames()[0]
    expect(frame.activity).toBe('departing')
  })

  it('endPresenceSession resolves outstanding waitForNextCommit waiters as capped', async () => {
    notifyEventPosted(SESSION, CLIENT)
    emitAction(mkEvent({}))
    tick()
    const pending = waitForNextCommit(SESSION, 5_000)
    endPresenceSession(SESSION)
    const arrival = await pending
    expect(arrival).toBe('capped')
  })
})
