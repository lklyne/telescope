/**
 * Agent cursor rendering — pure playback of CursorDirector frames.
 *
 * Cursors live in canvas space. A single transform wrapper projects all
 * cursors through the shared canvas transform (canvasOrigin + pan + zoom),
 * so pan/zoom changes track atomically with the canvas — no IPC-lag
 * rubber-banding. Per-cursor counter-scale keeps icon and label at a
 * constant screen size regardless of zoom.
 *
 * The director in main tells the renderer where each cursor is at every
 * tick; the renderer paints. Ripple, error tint, and an idle drift wobble
 * are renderer-local — the ripple + error fire on `commitKey` / `errorKey`
 * monotonic counters from the director, the drift is a subtle sin/cos wobble
 * seeded per session so idle cursors feel alive rather than frozen.
 */

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CanvasSceneFrameEntity,
  LayoutPresenceFrame,
} from '../../shared/types'

// Short CSS transition smooths subpixel jitter between director ticks. The
// director runs at 16 ms; a ~100 ms transition means visual changes always
// look smooth even under slight scheduler variance.
const POSITION_TRANSITION_MS = 100

const RIPPLE_SIZE = 96
const RIPPLE_DURATION_MS = 260
const ERROR_TINT_MS = 800

/** Idle drift amplitude in screen pixels. */
const DRIFT_RADIUS_PX = 1.75
/** Two frequencies for the lissajous wobble; coprime-ish so the loop is long. */
const DRIFT_FREQ_X_HZ = 0.42
const DRIFT_FREQ_Y_HZ = 0.27

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

function SplineViz({
  frame,
  canvasOrigin,
  pan,
  zoom,
}: {
  frame: LayoutPresenceFrame
  canvasOrigin: { x: number; y: number }
  pan: { x: number; y: number }
  zoom: number
}) {
  const viz = frame.splineViz
  if (!viz || viz.polyline.length < 2) return null
  const project = (p: { x: number; y: number }) => ({
    x: canvasOrigin.x + pan.x + p.x * zoom,
    y: canvasOrigin.y + pan.y + p.y * zoom,
  })
  const path = viz.polyline
    .map((p, i) => {
      const sp = project(p)
      return `${i === 0 ? 'M' : 'L'} ${sp.x} ${sp.y}`
    })
    .join(' ')
  return (
    <svg
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 9998, width: '100%', height: '100%' }}
    >
      <path
        d={path}
        stroke={frame.color}
        strokeWidth={2}
        fill="none"
        strokeDasharray="4 4"
        opacity={0.4}
      />
      {viz.waypoints.map((r, i) => {
        const tl = project({ x: r.x, y: r.y })
        return (
          <rect
            key={i}
            x={tl.x}
            y={tl.y}
            width={r.width * zoom}
            height={r.height * zoom}
            stroke={frame.color}
            strokeWidth={1.5}
            fill="none"
            opacity={0.5}
            rx={3}
            ry={3}
          />
        )
      })}
    </svg>
  )
}

function hashSession(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0
  }
  return (h >>> 0) / 0xffffffff
}

/**
 * Idle drift — a small sin/cos wobble applied when the cursor isn't
 * actively traveling, seeded per session so cursors desynchronize. Uses a
 * ref + rAF to avoid triggering React re-renders every frame.
 */
function useIdleDrift(
  active: boolean,
  sessionId: string,
  elRef: React.RefObject<HTMLDivElement | null>,
  zoom: number,
) {
  const phaseRef = useRef(hashSession(sessionId) * Math.PI * 2)
  const zoomRef = useRef(zoom)
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    if (!active) {
      el.style.transform = 'translate3d(0, 0, 0)'
      return
    }
    let raf = 0
    const start = performance.now()
    const phase = phaseRef.current
    const loop = () => {
      const t = (performance.now() - start) / 1000
      const z = Math.max(0.05, zoomRef.current)
      const dx = Math.sin(t * Math.PI * 2 * DRIFT_FREQ_X_HZ + phase) * DRIFT_RADIUS_PX
      const dy = Math.sin(t * Math.PI * 2 * DRIFT_FREQ_Y_HZ + phase * 1.37) * DRIFT_RADIUS_PX
      // Drift is in screen pixels; the wrapper lives in canvas space, so
      // scale down by zoom to keep the wobble constant on-screen.
      el.style.transform = `translate3d(${dx / z}px, ${dy / z}px, 0)`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active, elRef])
}

function AgentCursor({
  frame,
  zoom,
}: {
  frame: LayoutPresenceFrame
  zoom: number
}) {
  const displayLabel = frame.label
  const driftRef = useRef<HTMLDivElement | null>(null)

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

  const driftActive =
    frame.activity !== 'traveling' && frame.activity !== 'departing'
  useIdleDrift(driftActive, frame.sessionId, driftRef, zoom)

  // Position is in canvas units — the parent wrapper applies the canvas
  // transform, so pan/zoom move this with the canvas atomically. Only
  // director-driven motion triggers the CSS transition.
  const positionStyle: CSSProperties = {
    left: 0,
    top: 0,
    transform: `translate3d(${frame.position.x}px, ${frame.position.y}px, 0)`,
    transition: `transform ${POSITION_TRANSITION_MS}ms linear`,
    willChange: 'transform',
    opacity: frame.activity === 'departing' ? 0 : 1,
    ...(frame.activity === 'departing'
      ? { transitionProperty: 'transform, opacity', transitionDuration: '600ms' }
      : null),
  }

  // Counter-scale keeps icon, label, and ripple at constant screen size
  // regardless of canvas zoom. No transition — tracks zoom atomically.
  const counterScaleStyle: CSSProperties = {
    transform: `scale(${1 / zoom})`,
    transformOrigin: 'top left',
  }

  const tintStyle: CSSProperties = {
    transition: 'filter 400ms ease-out',
    filter: errorKey != null ? 'saturate(1.6) hue-rotate(-15deg)' : 'saturate(1)',
  }

  const labelBg = errorKey != null ? '#ef4444' : frame.color

  return (
    <div className="absolute" style={positionStyle}>
      {/* Drift wrapper — imperative transform updates via rAF, no transition. */}
      <div ref={driftRef} style={{ willChange: 'transform' }}>
        <div style={counterScaleStyle}>
          <div style={tintStyle}>
            {rippleKey !== null && (
              <ClickRipple key={rippleKey} color={frame.color} />
            )}
            <FilledCursorIcon color={frame.color} size={24} />
            {displayLabel ? (
              <div
                className="ml-4 -mt-1.5 whitespace-nowrap rounded px-2 py-0.5"
                style={{
                  backgroundColor: `color-mix(in srgb, ${labelBg} 90%, transparent)`,
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
      </div>
    </div>
  )
}

/**
 * Derives which frames contain at least one active cursor so callers can
 * paint a soft outline. Canvas-space bounds check — cursor position and
 * frame canvasX/Y/width/height are all in the same coordinate system.
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
        if (
          cursor.position.x >= frame.canvasX &&
          cursor.position.x <= frame.canvasX + frame.width &&
          cursor.position.y >= frame.canvasY &&
          cursor.position.y <= frame.canvasY + frame.height
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
  canvasOrigin,
  pan,
  zoom,
}: {
  frames: LayoutPresenceFrame[]
  canvasOrigin: { x: number; y: number }
  pan: { x: number; y: number }
  zoom: number
}) {
  if (cursorFrames.length === 0) return null

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 9999 }}
    >
      <style>
        {`@keyframes agent-click-ripple { 0% { transform: scale(0); opacity: 0.6; } 70% { opacity: 0.3; } 100% { transform: scale(1); opacity: 0; } }`}
      </style>
      {cursorFrames.map((frame) =>
        frame.splineViz ? (
          <SplineViz
            key={`viz-${frame.sessionId}`}
            frame={frame}
            canvasOrigin={canvasOrigin}
            pan={pan}
            zoom={zoom}
          />
        ) : null,
      )}
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate(${canvasOrigin.x + pan.x}px, ${canvasOrigin.y + pan.y}px) scale(${zoom})`,
        }}
      >
        {cursorFrames.map((frame) => (
          <AgentCursor key={frame.sessionId} frame={frame} zoom={zoom} />
        ))}
      </div>
    </div>
  )
}
