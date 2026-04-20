import { type CSSProperties, useMemo, useEffect, useRef, useState } from 'react'
import type {
  AgentPresenceCursor,
  CanvasSceneFrameEntity,
  PresenceActivity,
} from '../../shared/types'
import { labelForPresenceCursor } from '../../shared/agent-presence'
import { framePointMatchesTargetRect } from '../../shared/presence-targeting'
import {
  PRESENCE_TRAVEL_MS,
  PRESENCE_STEP_DELAY_MS,
} from '../../shared/presence-timing'

const ANIMATE_DURATION_MS = PRESENCE_TRAVEL_MS

function FilledCursorIcon({
  color,
  size = 16,
}: {
  color: string
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      stroke="rgba(255,255,255,0.9)"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
    >
      <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />
    </svg>
  )
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
  zoom,
}: {
  cursor: AgentPresenceCursor
  zoom: number
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

  // Position is in canvas units — the parent wrapper applies the canvas
  // transform, so pan/zoom move this with the canvas atomically. Only
  // director-driven motion triggers the CSS transition.
  const positionStyle: CSSProperties = useMemo(
    () => ({
      left: 0,
      top: 0,
      transform: `translate3d(${cursor.canvasX}px, ${cursor.canvasY}px, 0)`,
      transition: `transform ${ANIMATE_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity 800ms ease-out`,
      willChange: 'transform',
    }),
    [cursor.canvasX, cursor.canvasY],
  )

  // Counter-scale keeps icon, label, and ripple at constant screen size
  // regardless of canvas zoom.
  const counterScaleStyle: CSSProperties = {
    transform: `scale(${1 / zoom})`,
    transformOrigin: 'top left',
  }

  const activityTransformStyle = activityStyle(cursor.activity)

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
