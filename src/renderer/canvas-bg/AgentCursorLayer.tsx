import { type CSSProperties, useMemo, useEffect, useRef, useState } from 'react'
import type {
  AgentPresenceCursor,
  CanvasSceneFrameEntity,
  PresenceActivity,
} from '../../shared/types'
import { labelForPresenceCursor } from '../../shared/agent-presence'
import { DEFAULT_CURSOR_MOTION, easeAt } from '../../shared/cursor-motion'
import { foldSpline } from '../../shared/cursor-spline'
import { framePointMatchesTargetRect } from '../../shared/presence-targeting'
import {
  PRESENCE_TRAVEL_MS,
  PRESENCE_STEP_DELAY_MS,
} from '../../shared/presence-timing'
import { FilledCursorIcon } from '../shared/FilledCursorIcon'

const ANIMATE_DURATION_MS = PRESENCE_TRAVEL_MS
const PRODUCTION_CURSOR_MOTION = {
  ...DEFAULT_CURSOR_MOTION,
  durationMs: ANIMATE_DURATION_MS,
  distanceScaling: 0,
}
const POSITION_EPSILON = 0.5

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
  zoom,
}: {
  cursor: AgentPresenceCursor
  zoom: number
}) {
  const label = labelForPresenceCursor(cursor)
  const [rippleKey, setRippleKey] = useState<number | null>(null)
  const [displayPoint, setDisplayPoint] = useState(() => ({
    x: cursor.canvasX,
    y: cursor.canvasY,
  }))
  const rippleCounterRef = useRef(0)
  const prevActivity = useRef(cursor.activity)
  const animationFrameRef = useRef<number | null>(null)
  const pointRef = useRef(displayPoint)
  const tangentRef = useRef({ x: 1, y: 0 })

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

  useEffect(() => {
    pointRef.current = displayPoint
  }, [displayPoint])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const target = { x: cursor.canvasX, y: cursor.canvasY }
    const current = pointRef.current

    if (
      Math.abs(target.x - current.x) < POSITION_EPSILON &&
      Math.abs(target.y - current.y) < POSITION_EPSILON
    ) {
      pointRef.current = target
      setDisplayPoint(target)
      return
    }

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    const spline = foldSpline(current, tangentRef.current, [target])
    let startedAt = 0

    const tick = (now: number) => {
      if (startedAt === 0) startedAt = now
      const progress = Math.min(1, (now - startedAt) / PRODUCTION_CURSOR_MOTION.durationMs)
      const sample = spline.sampleT(easeAt(PRODUCTION_CURSOR_MOTION.easing, progress))
      pointRef.current = sample.position
      tangentRef.current = sample.tangent
      setDisplayPoint(sample.position)

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(tick)
      } else {
        animationFrameRef.current = null
        pointRef.current = target
        setDisplayPoint(target)
      }
    }

    animationFrameRef.current = requestAnimationFrame(tick)
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [cursor.canvasX, cursor.canvasY])

  const positionStyle: CSSProperties = useMemo(
    () => ({
      left: 0,
      top: 0,
      transform: `translate3d(${displayPoint.x}px, ${displayPoint.y}px, 0)`,
      willChange: 'transform',
    }),
    [displayPoint.x, displayPoint.y],
  )

  // Counter-scale keeps icon, label, and ripple at constant screen size
  // regardless of canvas zoom.
  const counterScaleStyle: CSSProperties = {
    transform: `scale(${1 / zoom})`,
    transformOrigin: 'top left',
  }

  // Transition transform/opacity/filter so activity changes (acting ↔ idle,
  // fade on departing) ease instead of snapping — matches pre-refactor UX.
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
          {label ? (
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
        {cursors.map((cursor) => (
          <AgentCursor key={cursor.sessionId} cursor={cursor} zoom={zoom} />
        ))}
      </div>
    </div>
  )
}
