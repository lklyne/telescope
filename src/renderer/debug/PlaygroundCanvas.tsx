import { useEffect, useRef, useState } from 'react'
import type { CursorMotionParams, Vec2 } from '../../shared/types'
import {
  cubicBezierPoint,
  deriveControlPoints,
  easeAt,
} from '../../shared/cursor-motion'
import { FilledCursorIcon } from '../canvas-bg/AgentCursorLayer'

const TRAIL_LIMIT = 12
const CURSOR_COLOR = '#2563eb'
const ACTIVE_TRAIL_COLOR = '#16a34a'

type Trail = {
  id: number
  p0: Vec2
  p1: Vec2
  p2: Vec2
  p3: Vec2
}

type Animation = {
  id: number
  start: number
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
    const { p1, p2 } = deriveControlPoints(p0, target, activeParams, seq)
    const id = seq

    setTrails((prev) => {
      const next = [...prev, { id, p0, p1, p2, p3: target }]
      return next.length > TRAIL_LIMIT ? next.slice(next.length - TRAIL_LIMIT) : next
    })
    setActiveTrailId(id)

    animRef.current = {
      id,
      start: performance.now(),
      p0,
      p1,
      p2,
      p3: target,
      params: activeParams,
    }

    const tick = (now: number) => {
      const a = animRef.current
      if (!a || !cursorRef.current) {
        rafRef.current = null
        return
      }
      const t = Math.min(1, (now - a.start) / Math.max(1, a.params.durationMs))
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
        const opacity = isActive ? 0.95 : Math.max(0.08, 0.5 - ageFromNewest * 0.04)
        const stroke = isActive ? ACTIVE_TRAIL_COLOR : hueFor(trail.id)
        const width = isActive ? 2.25 : 1.25
        const d =
          `M ${trail.p0.x} ${trail.p0.y} ` +
          `C ${trail.p1.x} ${trail.p1.y}, ${trail.p2.x} ${trail.p2.y}, ${trail.p3.x} ${trail.p3.y}`
        return (
          <path
            key={trail.id}
            d={d}
            fill="none"
            stroke={stroke}
            strokeOpacity={opacity}
            strokeWidth={width}
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
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
