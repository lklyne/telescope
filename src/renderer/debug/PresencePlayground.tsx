/**
 * Presence playground — a local mirror of the director's advance loop, run
 * entirely in the renderer against the current tuning. Click anywhere to set
 * a new waypoint; the cursor folds onto a fresh spline from its current
 * (position, tangent), then advances at the director's speed model:
 *
 *   speed = baseSpeedPxS * distanceSpeedScale(length)
 *
 * If this playground feels snappy but the real agent cursor feels slow, the
 * gap is somewhere outside the director's math — likely HTTP verb latency
 * or a waypoint rect that's farther from the cursor than expected.
 */

import { useEffect, useRef, useState } from 'react'
import type { CursorTuningParams } from '../../shared/types'
import { easeAt, type Vec2 } from '../../shared/cursor-motion'
import { foldSpline, type CatmullRomSpline } from '../../shared/cursor-spline'
import {
  CURSOR_DISTANCE_REFERENCE_PX,
  distanceSpeedScale,
} from '../../shared/cursor-tuning'
import { FilledCursorIcon } from '../canvas-bg/AgentCursorLayer'

const TRAIL_LIMIT = 6
const CURSOR_COLOR = '#2563eb'
const ACTIVE_STROKE = '#16a34a'
const GHOST_STROKE = '#64748b'
const SPLINE_SAMPLES = 48
const SPLINE_ALPHA = 0.5

type Trail = {
  id: number
  polyline: Vec2[]
  target: Vec2
}

interface ActiveRun {
  id: number
  spline: CatmullRomSpline
  splineSpeedScale: number
  durationMs: number
  elapsedMs: number
  target: Vec2
}

export function PresencePlayground({
  tuning,
}: {
  tuning: CursorTuningParams
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const positionRef = useRef<Vec2>({ x: 160, y: 160 })
  const tangentRef = useRef<Vec2>({ x: 1, y: 0 })
  const activeRef = useRef<ActiveRun | null>(null)
  const tuningRef = useRef(tuning)
  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef<number>(0)
  const seqRef = useRef(0)

  const [trails, setTrails] = useState<Trail[]>([])
  const [activeSplinePolyline, setActiveSplinePolyline] = useState<Vec2[] | null>(
    null,
  )
  const [stats, setStats] = useState<{
    length: number
    speedPxS: number
    durationMs: number
  } | null>(null)

  useEffect(() => {
    tuningRef.current = tuning
  }, [tuning])

  useEffect(() => {
    applyCursorTransform(cursorRef.current, positionRef.current)
  }, [])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const ensureRaf = () => {
    if (rafRef.current !== null) return
    lastTickRef.current = performance.now()
    const tick = (now: number) => {
      rafRef.current = null
      const run = activeRef.current
      if (!run) return

      const dtMs = Math.min(now - lastTickRef.current, 1000 / 30)
      lastTickRef.current = now

      const t = tuningRef.current
      if (Number.isFinite(run.durationMs) && run.durationMs > 0) {
        run.elapsedMs = Math.min(run.durationMs, run.elapsedMs + dtMs)
      }
      const progressT = run.durationMs > 0 ? run.elapsedMs / run.durationMs : 1
      const easedT = easeAt(t.easing, progressT)
      const arc = easedT * run.spline.totalLength
      const sample = run.spline.sample(arc)
      positionRef.current = sample.position
      tangentRef.current = sample.tangent
      applyCursorTransform(cursorRef.current, sample.position)

      if (progressT >= 1) {
        // Arrived. Retire the active spline; subsequent clicks re-fold from
        // this settled (position, tangent).
        activeRef.current = null
        setActiveSplinePolyline(null)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const host = hostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    const target: Vec2 = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
    const from = positionRef.current
    const distance = Math.hypot(target.x - from.x, target.y - from.y)
    if (distance < 1) return

    const t = tuningRef.current
    const spline = foldSpline(from, tangentRef.current, [target], SPLINE_ALPHA)
    const splineSpeedScale = distanceSpeedScale(t, spline.totalLength)
    const effectiveSpeed = t.baseSpeedPxS * splineSpeedScale
    const durationMs =
      effectiveSpeed > 0 ? (spline.totalLength / effectiveSpeed) * 1000 : Infinity

    const id = ++seqRef.current
    const polyline = spline.polyline(SPLINE_SAMPLES)
    setActiveSplinePolyline(polyline)
    setTrails((prev) => {
      const next = [...prev, { id, polyline, target }]
      return next.length > TRAIL_LIMIT ? next.slice(next.length - TRAIL_LIMIT) : next
    })
    setStats({
      length: spline.totalLength,
      speedPxS: effectiveSpeed,
      durationMs,
    })

    activeRef.current = {
      id,
      spline,
      splineSpeedScale,
      durationMs,
      elapsedMs: 0,
      target,
    }
    ensureRaf()
  }

  return (
    <div className="relative flex h-full w-full min-w-0 flex-col">
      <div
        ref={hostRef}
        onClick={handleClick}
        className="relative min-h-0 flex-1 cursor-crosshair select-none overflow-hidden"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(120,120,120,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(120,120,120,0.08) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      >
        <TrailsSvg trails={trails} activeId={activeRef.current?.id ?? null} />
        <ActiveSpline polyline={activeSplinePolyline} />
        <div
          ref={cursorRef}
          className="pointer-events-none absolute"
          style={{ left: 0, top: 0, willChange: 'transform' }}
        >
          <FilledCursorIcon color={CURSOR_COLOR} size={24} />
        </div>
        <InstructionHint />
        <StatsOverlay tuning={tuning} stats={stats} />
      </div>
    </div>
  )
}

function applyCursorTransform(el: HTMLDivElement | null, p: Vec2) {
  if (!el) return
  el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`
}

function polylineToPath(points: Vec2[]): string {
  if (points.length === 0) return ''
  const [head, ...rest] = points
  return `M ${head.x} ${head.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')}`
}

function TrailsSvg({
  trails,
  activeId,
}: {
  trails: Trail[]
  activeId: number | null
}) {
  if (trails.length === 0) return null
  const total = trails.length
  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width="100%"
      height="100%"
    >
      {trails.map((trail, index) => {
        const isActive = trail.id === activeId
        const ageFromNewest = total - 1 - index
        const fade = Math.max(0.05, 0.55 - ageFromNewest * 0.09)
        const d = polylineToPath(trail.polyline)
        return (
          <g key={trail.id}>
            <path
              d={d}
              fill="none"
              stroke={isActive ? ACTIVE_STROKE : GHOST_STROKE}
              strokeOpacity={isActive ? 0.95 : Math.max(0.12, fade)}
              strokeWidth={isActive ? 2.25 : 1.25}
              strokeLinecap="round"
            />
            <circle
              cx={trail.target.x}
              cy={trail.target.y}
              r={3}
              fill={isActive ? ACTIVE_STROKE : GHOST_STROKE}
              fillOpacity={isActive ? 0.75 : Math.max(0.12, fade)}
            />
          </g>
        )
      })}
    </svg>
  )
}

function ActiveSpline({ polyline }: { polyline: Vec2[] | null }) {
  if (!polyline || polyline.length === 0) return null
  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width="100%"
      height="100%"
    >
      <path
        d={polylineToPath(polyline)}
        fill="none"
        stroke={ACTIVE_STROKE}
        strokeOpacity={0.35}
        strokeWidth={4}
        strokeLinecap="round"
      />
    </svg>
  )
}

function InstructionHint() {
  return (
    <div
      className="pointer-events-none absolute left-4 top-4 rounded px-2 py-1 text-[11px] opacity-60"
      style={{
        background: 'color-mix(in srgb, var(--surface-panel) 88%, transparent)',
      }}
    >
      Click anywhere to retarget the cursor
    </div>
  )
}

function StatsOverlay({
  tuning,
  stats,
}: {
  tuning: CursorTuningParams
  stats: { length: number; speedPxS: number; durationMs: number } | null
}) {
  return (
    <div
      className="pointer-events-none absolute right-4 top-4 rounded px-2 py-1 text-[11px] tabular-nums opacity-80"
      style={{
        background: 'color-mix(in srgb, var(--surface-panel) 88%, transparent)',
      }}
    >
      <div>
        base {tuning.baseSpeedPxS} px/s · scale {tuning.distanceScaling.toFixed(2)}
      </div>
      <div>ref {CURSOR_DISTANCE_REFERENCE_PX} px</div>
      {stats ? (
        <div className="mt-1 border-t border-black/10 pt-1 dark:border-white/10">
          <div>length {stats.length.toFixed(0)} px</div>
          <div>
            speed{' '}
            {Number.isFinite(stats.speedPxS) ? stats.speedPxS.toFixed(0) : '0'} px/s
          </div>
          <div>
            duration{' '}
            {Number.isFinite(stats.durationMs)
              ? `${stats.durationMs.toFixed(0)} ms`
              : '∞'}
          </div>
        </div>
      ) : null}
    </div>
  )
}
