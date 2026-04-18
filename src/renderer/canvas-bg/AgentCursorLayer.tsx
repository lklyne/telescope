/**
 * Agent cursor rendering — pure playback of director narration frames.
 *
 * The renderer has no animation opinions of its own. The director in the main
 * process tells it where the cursor is at every tick and what phase/mood it
 * is in; the renderer just paints.
 *
 * The only renderer-local state is the ripple and error-tint pulses, which
 * trigger on `commitKey` and `errorKey` monotonic counters sent by the
 * director — the renderer never decides *when* to ripple, only *how*.
 */

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CanvasSceneFrameEntity,
  LayoutPresenceFrame,
} from '../../shared/types'
import { MOOD_VISUALS } from '../../shared/narration-visuals'

// Short CSS transition smooths subpixel jitter between director ticks. The
// director runs at 16 ms; a ~100 ms transition means visual changes always
// look smooth even under slight scheduler variance.
const POSITION_TRANSITION_MS = 100

const RIPPLE_SIZE = 96
const RIPPLE_DURATION_MS = 260
const ERROR_TINT_MS = 800

export function FilledCursorIcon({
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
        animation: `agent-click-ripple ${RIPPLE_DURATION_MS}ms ease-out forwards`,
        opacity: 0,
        pointerEvents: 'none',
      }}
    />
  )
}

function SplineViz({ frame }: { frame: LayoutPresenceFrame }) {
  const viz = frame.splineViz
  if (!viz || viz.polyline.length < 2) return null
  const path = viz.polyline
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')
  return (
    <svg
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 9998, width: '100vw', height: '100vh' }}
    >
      <path
        d={path}
        stroke={frame.color}
        strokeWidth={2}
        fill="none"
        strokeDasharray="4 4"
        opacity={0.4}
      />
      {viz.waypoints.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.width}
          height={r.height}
          stroke={frame.color}
          strokeWidth={1.5}
          fill="none"
          opacity={0.5}
          rx={3}
          ry={3}
        />
      ))}
    </svg>
  )
}

function AgentCursor({ frame }: { frame: LayoutPresenceFrame }) {
  const visuals = MOOD_VISUALS[frame.mood]
  const effectiveColor = visuals.tint ?? frame.color
  const displayLabel = frame.label

  const [rippleKey, setRippleKey] = useState<number | null>(null)
  const [errorKey, setErrorKey] = useState<number | null>(null)
  const prevCommitKey = useRef(frame.commitKey)
  const prevErrorKey = useRef(frame.errorKey)

  useEffect(() => {
    if (frame.commitKey !== prevCommitKey.current) {
      prevCommitKey.current = frame.commitKey
      setRippleKey(frame.commitKey)
    }
  }, [frame.commitKey])

  useEffect(() => {
    if (frame.errorKey !== prevErrorKey.current) {
      prevErrorKey.current = frame.errorKey
      setErrorKey(frame.errorKey)
      const t = setTimeout(() => setErrorKey(null), ERROR_TINT_MS)
      return () => clearTimeout(t)
    }
  }, [frame.errorKey])

  const outerStyle: CSSProperties = {
    left: 0,
    top: 0,
    transform: `translate3d(${frame.screenX}px, ${frame.screenY}px, 0)`,
    transition: `transform ${POSITION_TRANSITION_MS}ms linear`,
    willChange: 'transform',
    opacity:
      frame.activity === 'departing'
        ? 0
        : frame.activity === 'idle'
          ? visuals.opacity * 0.6
          : visuals.opacity,
    ...(frame.activity === 'departing'
      ? { transitionProperty: 'transform, opacity', transitionDuration: '600ms' }
      : null),
  }

  const pulseAnimation =
    visuals.pulse === 'gentle'
      ? 'agent-presence-pulse 1.4s ease-in-out infinite'
      : visuals.pulse === 'strong'
        ? 'agent-presence-pulse 0.9s ease-in-out infinite'
        : undefined

  const innerStyle: CSSProperties = {
    transform: `scale(${visuals.scale})`,
    transition: 'transform 200ms ease-out, filter 400ms ease-out',
    filter: errorKey != null ? 'saturate(1.6) hue-rotate(-15deg)' : 'saturate(1)',
    animation: pulseAnimation,
  }

  const labelBg = errorKey != null ? '#ef4444' : effectiveColor

  return (
    <>
      <div className="absolute" style={outerStyle}>
        <div style={innerStyle}>
          {rippleKey !== null && (
            <ClickRipple key={rippleKey} color={effectiveColor} />
          )}
          <FilledCursorIcon color={effectiveColor} size={24} />
          {displayLabel ? (
            <div
              className="ml-4 -mt-1.5 whitespace-nowrap rounded px-2 py-0.5"
              style={{
                backgroundColor: `color-mix(in srgb, ${labelBg} ${visuals.labelBgAlpha * 100}%, transparent)`,
                fontSize: 10,
                lineHeight: '14px',
                color: 'white',
                boxShadow:
                  frame.activity === 'committing'
                    ? '0 2px 8px rgba(0,0,0,0.28)'
                    : '0 1px 3px rgba(0,0,0,0.2)',
              }}
            >
              {displayLabel}
              {frame.intent ? (
                <div
                  style={{
                    fontSize: 8.5,
                    lineHeight: '11px',
                    opacity: 0.8,
                    fontStyle: 'italic',
                  }}
                >
                  {frame.intent}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}

/**
 * Derives which frames contain at least one active cursor so callers can
 * paint a soft outline. Canvas-space cursors mean "which frame am I in" is
 * a simple bounds check.
 */
export function ActiveFrameHighlightLayer({
  frames,
  cursorFrames,
}: {
  frames: CanvasSceneFrameEntity[]
  cursorFrames: LayoutPresenceFrame[]
}) {
  const activeFrames = useMemo(() => {
    const map = new Map<string, string>()
    for (const cursor of cursorFrames) {
      for (const frame of frames) {
        const fx = frame.screenX
        const fy = frame.screenY
        const fw = frame.screenWidth
        const fh = frame.screenHeight
        if (
          cursor.screenX >= fx &&
          cursor.screenX <= fx + fw &&
          cursor.screenY >= fy &&
          cursor.screenY <= fy + fh
        ) {
          if (!map.has(frame.id)) map.set(frame.id, cursor.color)
          break
        }
      }
    }
    return map
  }, [cursorFrames, frames])

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
  frames: cursorFrames,
}: {
  frames: LayoutPresenceFrame[]
  /** Kept for compatibility; the canvas-layer consumers pass these but the
   * renderer no longer needs frame geometry for positioning (canvas-space
   * cursors project through the shared zoom/pan transform in main). */
  sceneFrames?: CanvasSceneFrameEntity[]
  overlayOffsetY?: number
}) {
  if (cursorFrames.length === 0) return null

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 9999 }}
    >
      <style>
        {`@keyframes agent-presence-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
@keyframes agent-click-ripple { 0% { transform: scale(0); opacity: 0.6; } 70% { opacity: 0.3; } 100% { transform: scale(1); opacity: 0; } }`}
      </style>
      {cursorFrames.map((frame) => (
        <AgentCursor key={frame.sessionId} frame={frame} />
      ))}
      {cursorFrames.map((frame) =>
        frame.splineViz ? <SplineViz key={`viz-${frame.sessionId}`} frame={frame} /> : null,
      )}
    </div>
  )
}
