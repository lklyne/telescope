import { type CSSProperties, useMemo, useEffect, useRef, useState } from 'react'
import type {
  AgentPresenceCursor,
  CanvasSceneFrameEntity,
  PresenceActivity,
} from '../../shared/types'
import {
  emitterModeForPresenceCursor,
  labelForPresenceCursor,
} from '../../shared/agent-presence'
import {
  DEFAULT_CURSOR_MOTION,
  DISTANCE_SCALE_REFERENCE_PX,
  easeAt,
  type Vec2,
} from '../../shared/cursor-motion'
import { foldSpline } from '../../shared/cursor-spline'
import { framePointMatchesTargetRect } from '../../shared/presence-targeting'
import {
  PRESENCE_TRAVEL_MS,
  PRESENCE_STEP_DELAY_MS,
} from '../../shared/presence-timing'
import { FilledCursorIcon } from '../shared/FilledCursorIcon'
import {
  CURSOR_TRAIL_OFFSET,
  ORBIT_RECT_INTENSITY,
  ORBIT_SPHERE_INTENSITY,
  PresenceParticleTrail,
  type PresenceParticleControls,
  type PresenceParticleCursor,
  type PresenceParticleTargetRect,
} from '../shared/PresenceParticleTrail'

const ANIMATE_DURATION_MS = PRESENCE_TRAVEL_MS
// Short hops complete faster, longer hops cap at ANIMATE_DURATION_MS, so the
// pre-click dwell budget grows when the cursor only needs to travel a few px.
const MIN_ANIMATE_DURATION_MS = 60
const PRODUCTION_CURSOR_MOTION = {
  ...DEFAULT_CURSOR_MOTION,
  durationMs: ANIMATE_DURATION_MS,
  distanceScaling: 0,
}
const POSITION_EPSILON = 0.5

// Dev flag (localStorage-backed) to reveal the text status chip. Off by
// default so particle effects are the primary presence cue; toggle via
// `localStorage.setItem('telescope.showPresenceLabels', 'true')` in devtools.
const SHOW_PRESENCE_LABELS_KEY = 'telescope.showPresenceLabels'

function readShowPresenceLabels(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage?.getItem(SHOW_PRESENCE_LABELS_KEY) === 'true'
  } catch {
    return false
  }
}

function useShowPresenceLabels(): boolean {
  const [show, setShow] = useState(readShowPresenceLabels)
  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === SHOW_PRESENCE_LABELS_KEY) {
        setShow(event.newValue === 'true')
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])
  return show
}

function animationDurationForDistance(distance: number): number {
  if (distance <= 0) return 0
  if (distance >= DISTANCE_SCALE_REFERENCE_PX) return ANIMATE_DURATION_MS
  const scaled = ANIMATE_DURATION_MS * (distance / DISTANCE_SCALE_REFERENCE_PX)
  return Math.max(MIN_ANIMATE_DURATION_MS, scaled)
}

function activityStyle(activity: PresenceActivity): CSSProperties {
  switch (activity) {
    case 'traveling':
      return { opacity: 1, transform: 'scale(1)', filter: 'saturate(1.1)' }
    case 'acting':
      return { opacity: 1, transform: 'scale(1.02)', filter: 'saturate(1.15)' }
    case 'waiting':
      return {
        opacity: 0.95,
        transform: 'scale(1)',
        animation: 'agent-presence-pulse 1.3s ease-in-out infinite',
      }
    case 'thinking':
      return { opacity: 1, transform: 'scale(0.98)' }
    case 'idle':
      return { opacity: 0.38, transform: 'scale(0.96)' }
    case 'departing':
      return { opacity: 0.7, transform: 'scale(0.96)' }
  }
}

function TargetHalo({
  cursor,
  frame,
  overlayOffsetY,
}: {
  cursor: AgentPresenceCursor
  frame: CanvasSceneFrameEntity | null
  overlayOffsetY: number
}) {
  if (
    !frame ||
    !cursor.targetRect ||
    !framePointMatchesTargetRect(
      cursor.frameX,
      cursor.frameY,
      cursor.targetRect,
    )
  ) {
    return null
  }
  const scaleX = frame.screenWidth / Math.max(frame.width, 1)
  const scaleY = frame.screenHeight / Math.max(frame.height, 1)
  return (
    <div
      className="absolute rounded-xl border"
      style={{
        left: frame.screenX + cursor.targetRect.x * scaleX - 6,
        top: frame.screenY + cursor.targetRect.y * scaleY - overlayOffsetY - 6,
        width: cursor.targetRect.width * scaleX + 12,
        height: cursor.targetRect.height * scaleY + 12,
        borderColor: cursor.color,
        boxShadow: `0 0 0 2px color-mix(in srgb, ${cursor.color} 32%, transparent)`,
        background: `color-mix(in srgb, ${cursor.color} 14%, transparent)`,
      }}
    />
  )
}

const RIPPLE_SIZE = 96
const RIPPLE_DURATION_MS = 100

const RIPPLE_DELAY_MS = PRESENCE_STEP_DELAY_MS - RIPPLE_DURATION_MS

function ClickRipple({ color }: { color: string }) {
  return (
    <div
      className="absolute rounded-full"
      style={{
        width: RIPPLE_SIZE,
        height: RIPPLE_SIZE,
        left: -(RIPPLE_SIZE / 2),
        top: -(RIPPLE_SIZE / 2),
        background: `color-mix(in srgb, ${color} 40%, transparent)`,
        animation: `agent-click-ripple ${RIPPLE_DURATION_MS}ms ease-out ${RIPPLE_DELAY_MS}ms forwards`,
        opacity: 0,
        pointerEvents: 'none',
      }}
    />
  )
}

function AgentCursor({
  cursor,
  point,
  zoom,
  showLabel,
}: {
  cursor: AgentPresenceCursor
  point: Vec2
  zoom: number
  showLabel: boolean
}) {
  const label = labelForPresenceCursor(cursor)
  const [rippleKey, setRippleKey] = useState<number | null>(null)
  const rippleCounterRef = useRef(0)
  const prevActivity = useRef(cursor.activity)

  useEffect(() => {
    const wasClick =
      cursor.activity === 'acting' &&
      cursor.labelKey === 'click_target' &&
      prevActivity.current !== 'acting'
    prevActivity.current = cursor.activity
    if (wasClick) {
      setRippleKey(++rippleCounterRef.current)
    }
  }, [cursor.activity, cursor.labelKey])

  const positionStyle: CSSProperties = useMemo(
    () => ({
      left: 0,
      top: 0,
      transform: `translate3d(${point.x}px, ${point.y}px, 0)`,
      willChange: 'transform',
    }),
    [point.x, point.y],
  )

  // Counter-scale keeps icon, label, and ripple at constant screen size
  // regardless of canvas zoom.
  const counterScaleStyle: CSSProperties = {
    transform: `scale(${1 / zoom})`,
    transformOrigin: 'top left',
  }

  // Transition transform/opacity/filter so activity changes (acting ↔ idle,
  // fade on departing) ease instead of snapping.
  const activityTransformStyle: CSSProperties = {
    ...activityStyle(cursor.activity),
    transition: 'transform 800ms ease-out, opacity 800ms ease-out, filter 800ms ease-out',
  }

  return (
    <div className="absolute" style={positionStyle}>
      <div style={counterScaleStyle}>
        <div style={activityTransformStyle}>
          {rippleKey !== null && (
            <ClickRipple key={rippleKey} color={cursor.color} />
          )}
          <FilledCursorIcon color={cursor.color} size={24} />
          {showLabel && label ? (
            <div
              className="ml-4 -mt-1.5 whitespace-nowrap rounded px-2 py-0.5"
              style={{
                backgroundColor: cursor.color,
                fontSize: 10,
                lineHeight: '14px',
                color: 'white',
                boxShadow:
                  cursor.activity === 'acting'
                    ? '0 2px 8px rgba(0,0,0,0.28)'
                    : '0 1px 3px rgba(0,0,0,0.2)',
              }}
            >
              {label}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function ActiveFrameHighlightLayer({
  cursors,
  frames,
}: {
  cursors: AgentPresenceCursor[]
  frames: CanvasSceneFrameEntity[]
}) {
  const activeFrames = useMemo(() => {
    const map = new Map<string, string>()
    for (const cursor of cursors) {
      if (cursor.frameId && !map.has(cursor.frameId)) {
        map.set(cursor.frameId, cursor.color)
      }
    }
    return map
  }, [cursors])

  if (activeFrames.size === 0) return null
  const inset = -4
  return (
    <>
      {frames
        .filter((frame) => activeFrames.has(frame.id))
        .map((frame) => (
          <div
            key={`frame-highlight-${frame.id}`}
            className="absolute rounded-sm pointer-events-none"
            style={{
              left: frame.screenX + inset,
              top: frame.screenY + inset,
              width: frame.screenWidth - inset * 2,
              height: frame.screenHeight - inset * 2,
              boxShadow: `0 0 0 2px ${activeFrames.get(frame.id)!}, 0 0 24px 4px color-mix(in srgb, ${activeFrames.get(frame.id)!} 25%, transparent)`,
              transition: 'box-shadow 300ms ease-out',
            }}
          />
        ))}
    </>
  )
}

interface CursorAnim {
  point: Vec2
  tangent: Vec2
  spline: ReturnType<typeof foldSpline> | null
  startedAt: number
  duration: number
  target: Vec2
}

interface AnimatedCursor {
  cursor: AgentPresenceCursor
  point: Vec2
  isAnimating: boolean
}

// Drives one RAF for all presence cursors so the DOM icon and particle trail
// read from the same interpolated positions. Target changes from the server
// start a new spline from the current (position, tangent). The RAF only runs
// while at least one spline is active, so a steady-state canvas idles.
function useAnimatedCursors(cursors: AgentPresenceCursor[]): AnimatedCursor[] {
  const animsRef = useRef<Map<string, CursorAnim>>(new Map())
  const rafIdRef = useRef(0)
  const [, setTick] = useState(0)

  useEffect(() => {
    const anims = animsRef.current
    let installedSpline = false
    for (const c of cursors) {
      const target: Vec2 = { x: c.canvasX, y: c.canvasY }
      const existing = anims.get(c.sessionId)
      if (!existing) {
        anims.set(c.sessionId, {
          point: target,
          tangent: { x: 1, y: 0 },
          spline: null,
          startedAt: 0,
          duration: 0,
          target,
        })
        continue
      }
      const dx = target.x - existing.point.x
      const dy = target.y - existing.point.y
      if (Math.abs(dx) < POSITION_EPSILON && Math.abs(dy) < POSITION_EPSILON) {
        existing.target = target
        existing.spline = null
        continue
      }
      existing.spline = foldSpline(existing.point, existing.tangent, [target])
      existing.startedAt = 0
      existing.duration = animationDurationForDistance(Math.hypot(dx, dy))
      existing.target = target
      installedSpline = true
    }
    const active = new Set(cursors.map((c) => c.sessionId))
    for (const id of anims.keys()) {
      if (!active.has(id)) anims.delete(id)
    }
    if (installedSpline && rafIdRef.current === 0) {
      const tick = () => {
        let advanced = false
        let stillLive = false
        const now = performance.now()
        for (const anim of animsRef.current.values()) {
          if (!anim.spline) continue
          if (anim.startedAt === 0) anim.startedAt = now
          const progress =
            anim.duration <= 0
              ? 1
              : Math.min(1, (now - anim.startedAt) / anim.duration)
          const sample = anim.spline.sampleT(
            easeAt(PRODUCTION_CURSOR_MOTION.easing, progress),
          )
          anim.point = sample.position
          anim.tangent = sample.tangent
          if (progress >= 1) {
            anim.point = anim.target
            anim.spline = null
          }
          advanced = true
          if (anim.spline) stillLive = true
        }
        if (advanced) setTick((t) => t + 1)
        rafIdRef.current = stillLive ? requestAnimationFrame(tick) : 0
      }
      rafIdRef.current = requestAnimationFrame(tick)
    }
  }, [cursors])

  useEffect(
    () => () => {
      if (rafIdRef.current !== 0) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = 0
      }
    },
    [],
  )

  return cursors.map((c) => {
    const anim = animsRef.current.get(c.sessionId)
    return {
      cursor: c,
      point: anim?.point ?? { x: c.canvasX, y: c.canvasY },
      isAnimating: !!anim?.spline,
    }
  })
}

// Resolve a presence cursor's target rect into screen-space coordinates using
// the same transform TargetHalo uses (frame screen position + internal scale).
// Returns null if the cursor doesn't have a valid rect on a resolvable frame.
function resolveTargetRectScreen(
  cursor: AgentPresenceCursor,
  frame: CanvasSceneFrameEntity | null,
  overlayOffsetY: number,
): PresenceParticleTargetRect | null {
  if (!frame || !cursor.targetRect) return null
  const scaleX = frame.screenWidth / Math.max(frame.width, 1)
  const scaleY = frame.screenHeight / Math.max(frame.height, 1)
  return {
    x: frame.screenX + cursor.targetRect.x * scaleX,
    y: frame.screenY + cursor.targetRect.y * scaleY - overlayOffsetY,
    width: cursor.targetRect.width * scaleX,
    height: cursor.targetRect.height * scaleY,
  }
}

export function AgentCursorLayer({
  cursors,
  frames,
  canvasOrigin,
  pan,
  zoom,
  overlayOffsetY = 0,
}: {
  cursors: AgentPresenceCursor[]
  frames: CanvasSceneFrameEntity[]
  canvasOrigin: { x: number; y: number }
  pan: { x: number; y: number }
  zoom: number
  overlayOffsetY?: number
}) {
  const animated = useAnimatedCursors(cursors)
  const showLabels = useShowPresenceLabels()
  const particleControlsRef = useRef<PresenceParticleControls | null>(null)

  // Track previous activity per cursor so we can fire burst on the same
  // activity→acting+click_target transition that already drives ClickRipple.
  const prevActivityRef = useRef<Map<string, PresenceActivity>>(new Map())
  useEffect(() => {
    const prev = prevActivityRef.current
    for (const cursor of cursors) {
      const last = prev.get(cursor.sessionId)
      const justClicked =
        cursor.activity === 'acting' &&
        cursor.labelKey === 'click_target' &&
        last !== 'acting'
      if (justClicked) {
        particleControlsRef.current?.triggerBurst(cursor.sessionId)
      }
      prev.set(cursor.sessionId, cursor.activity)
    }
    const active = new Set(cursors.map((c) => c.sessionId))
    for (const id of prev.keys()) {
      if (!active.has(id)) prev.delete(id)
    }
  }, [cursors])

  // animated is a fresh array per render, so memoizing trailCursors would
  // invalidate every tick — just compute inline.
  const trailCursors: PresenceParticleCursor[] = animated.map(
    ({ cursor, point, isAnimating }) => {
      const desiredMode = emitterModeForPresenceCursor(cursor)
      const frame = cursor.frameId
        ? (frames.find((f) => f.id === cursor.frameId) ?? null)
        : null
      const rect =
        desiredMode === 'orbit_rect'
          ? resolveTargetRectScreen(cursor, frame, overlayOffsetY)
          : null
      // Downgrade to sphere if rect can't be resolved (e.g., labelKey is
      // inspect_page but the frame isn't in the scene yet).
      const emitterMode =
        desiredMode === 'orbit_rect' && !rect ? 'orbit_sphere' : desiredMode
      return {
        id: cursor.sessionId,
        x: canvasOrigin.x + pan.x + point.x * zoom + CURSOR_TRAIL_OFFSET.x,
        y:
          canvasOrigin.y +
          pan.y -
          overlayOffsetY +
          point.y * zoom +
          CURSOR_TRAIL_OFFSET.y,
        color: cursor.color,
        intensity:
          emitterMode === 'orbit_sphere'
            ? ORBIT_SPHERE_INTENSITY
            : emitterMode === 'orbit_rect'
              ? ORBIT_RECT_INTENSITY
              : isAnimating
                ? 1
                : 0,
        emitterMode,
        targetRect: emitterMode === 'orbit_rect' ? rect : null,
      }
    },
  )

  if (cursors.length === 0) return null

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 9999 }}
    >
      <style>
        {`@keyframes agent-presence-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
@keyframes agent-click-ripple { 0% { transform: scale(0); opacity: 0.6; } 100% { transform: scale(1); opacity: 0; } }`}
      </style>
      <PresenceParticleTrail
        cursors={trailCursors}
        onReady={(controls) => {
          particleControlsRef.current = controls
        }}
      />
      {cursors.map((cursor) => (
        <TargetHalo
          key={`halo-${cursor.sessionId}`}
          cursor={cursor}
          frame={
            cursor.frameId
              ? (frames.find((frame) => frame.id === cursor.frameId) ?? null)
              : null
          }
          overlayOffsetY={overlayOffsetY}
        />
      ))}
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate(${canvasOrigin.x + pan.x}px, ${canvasOrigin.y + pan.y - overlayOffsetY}px) scale(${zoom})`,
        }}
      >
        {animated.map(({ cursor, point }) => (
          <AgentCursor
            key={cursor.sessionId}
            cursor={cursor}
            point={point}
            zoom={zoom}
            showLabel={showLabels}
          />
        ))}
      </div>
    </div>
  )
}
