import { useEffect, useRef, useState } from 'react'
import type { CursorMotionParams, Vec2 } from '../../shared/types'
import {
  cubicBezierPoint,
  deriveCandidatePaths,
  easeAt,
  effectiveDurationMs,
  pickCandidateIndex,
  type MotionCandidate,
} from '../../shared/cursor-motion'
import { FilledCursorIcon } from '../shared/FilledCursorIcon'

const TRAIL_LIMIT = 6
const CURSOR_COLOR = '#2563eb'
const ACTIVE_TRAIL_COLOR = '#16a34a'
const GHOST_TRAIL_COLOR = '#64748b'

type Trail = {
  id: number
  p0: Vec2
  p3: Vec2
  candidates: MotionCandidate[]
  pickedIndex: number
}

type Animation = {
  id: number
  start: number
  durationMs: number
  p0: Vec2
  p1: Vec2
  p2: Vec2
  p3: Vec2
  params: CursorMotionParams
}

export function PlaygroundCanvas({ params }: { params: CursorMotionParams }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const posRef = useRef<Vec2>({ x: 120, y: 120 })
  const sequenceRef = useRef(0)
  const animRef = useRef<Animation | null>(null)
  const rafRef = useRef<number | null>(null)
  const paramsRef = useRef<CursorMotionParams>(params)

  const [trails, setTrails] = useState<Trail[]>([])
  const [activeTrailId, setActiveTrailId] = useState<number | null>(null)
  const [targetDot, setTargetDot] = useState<Vec2 | null>(null)

  useEffect(() => {
    paramsRef.current = params
  }, [params])

  useEffect(() => {
    if (cursorRef.current) {
      const p = posRef.current
      cursorRef.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`
    }
  }, [])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const host = hostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    const target: Vec2 = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
    setTargetDot(target)

    const p0 = posRef.current
    if (Math.hypot(target.x - p0.x, target.y - p0.y) < 1) return

    const activeParams = paramsRef.current
    const seq = ++sequenceRef.current
    const candidates = deriveCandidatePaths(p0, target, activeParams, seq)
    const pickedIndex = pickCandidateIndex(seq, candidates.length)
    const picked = candidates[pickedIndex]
    const id = seq

    setTrails((prev) => {
      const next = [...prev, { id, p0, p3: target, candidates, pickedIndex }]
      return next.length > TRAIL_LIMIT ? next.slice(next.length - TRAIL_LIMIT) : next
    })
    setActiveTrailId(id)

    const distance = Math.hypot(target.x - p0.x, target.y - p0.y)
    animRef.current = {
      id,
      start: performance.now(),
      durationMs: effectiveDurationMs(activeParams, distance),
      p0,
      p1: picked.p1,
      p2: picked.p2,
      p3: target,
      params: activeParams,
    }

    const tick = (now: number) => {
      const a = animRef.current
      if (!a || !cursorRef.current) {
        rafRef.current = null
        return
      }
      const t = Math.min(1, (now - a.start) / Math.max(1, a.durationMs))
      const easedT = easeAt(a.params.easing, t)
      const pos = cubicBezierPoint(a.p0, a.p1, a.p2, a.p3, easedT)
      posRef.current = pos
      cursorRef.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        animRef.current = null
        rafRef.current = null
      }
    }
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }

  return (
    <div
      ref={hostRef}
      onClick={handleClick}
      className="relative h-full w-full cursor-crosshair select-none"
      style={{
        backgroundImage:
          'linear-gradient(to right, rgba(120,120,120,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(120,120,120,0.08) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      }}
    >
      <TrailsSvg trails={trails} activeId={activeTrailId} />
      {targetDot ? (
        <div
          className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: targetDot.x,
            top: targetDot.y,
            background: ACTIVE_TRAIL_COLOR,
            opacity: 0.65,
          }}
        />
      ) : null}
      <div
        ref={cursorRef}
        className="pointer-events-none absolute"
        style={{ left: 0, top: 0, willChange: 'transform' }}
      >
        <FilledCursorIcon color={CURSOR_COLOR} size={24} />
      </div>
      <InstructionHint />
    </div>
  )
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
        const pickedHue = isActive ? ACTIVE_TRAIL_COLOR : hueFor(trail.id)
        return (
          <g key={trail.id}>
            {trail.candidates.map((cand, i) => {
              if (i === trail.pickedIndex) return null
              const d = pathD(trail.p0, cand.p1, cand.p2, trail.p3)
              return (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={GHOST_TRAIL_COLOR}
                  strokeOpacity={isActive ? 0.35 : fade * 0.45}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  strokeLinecap="round"
                />
              )
            })}
            {(() => {
              const picked = trail.candidates[trail.pickedIndex]
              if (!picked) return null
              const d = pathD(trail.p0, picked.p1, picked.p2, trail.p3)
              return (
                <path
                  d={d}
                  fill="none"
                  stroke={pickedHue}
                  strokeOpacity={isActive ? 0.95 : Math.max(0.12, fade)}
                  strokeWidth={isActive ? 2.25 : 1.5}
                  strokeLinecap="round"
                />
              )
            })()}
          </g>
        )
      })}
    </svg>
  )
}

function pathD(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): string {
  return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`
}

function hueFor(id: number): string {
  const hue = (id * 47) % 360
  return `hsl(${hue} 60% 60%)`
}

function InstructionHint() {
  return (
    <div
      className="pointer-events-none absolute left-4 top-4 rounded px-2 py-1 text-[11px] opacity-60"
      style={{ background: 'color-mix(in srgb, var(--surface-panel) 88%, transparent)' }}
    >
      Click anywhere to retarget the cursor
    </div>
  )
}
