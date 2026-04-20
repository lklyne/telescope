/**
 * Two-column presence timeline: CLI dispatches on the left, director activity
 * on the right, positioned vertically by wall-clock time. Newest at the bottom
 * so the column scrolls upward like a live log.
 *
 * Vertical distance between entries reflects real elapsed time for short gaps,
 * but idle stretches longer than GAP_THRESHOLD_MS are collapsed to a fixed
 * band with a labelled break, so bursty work stays legible.
 *
 * Faint horizontal gridlines span both columns at every event Y so CLI and
 * director rows on the same wall-clock moment line up visually.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PresenceDebugEntry } from '../../shared/types'

const DEFAULT_PX_PER_MS = 0.12
const MIN_ROW_PX = 18
const ROW_HEIGHT_PX = 22
const TOP_PAD_PX = 12
const BOTTOM_PAD_PX = 32
const GAP_THRESHOLD_MS = 800
const COMPRESSED_GAP_MS = 160

export function PresenceTimelinePanel({
  initialEntries,
  subscribe,
}: {
  initialEntries: PresenceDebugEntry[]
  subscribe: (cb: (entry: PresenceDebugEntry) => void) => () => void
}) {
  const [entries, setEntries] = useState<PresenceDebugEntry[]>(initialEntries)
  const [pxPerMs, setPxPerMs] = useState<number>(DEFAULT_PX_PER_MS)
  const [follow, setFollow] = useState(true)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return subscribe((entry) => {
      setEntries((prev) => {
        if (prev.length >= 500) return [...prev.slice(prev.length - 499), entry]
        return [...prev, entry]
      })
    })
  }, [subscribe])

  // Compute y-positions from timestamps. Each row clamps to MIN_ROW_PX above
  // the previous so bursts of same-millisecond events remain readable.
  const { layout, totalHeight, gridYs, gapBreaks } = useMemo(
    () => layoutEntries(entries, pxPerMs),
    [entries, pxPerMs],
  )

  useEffect(() => {
    if (!follow) return
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [totalHeight, follow])

  const onScroll = () => {
    const el = scrollerRef.current
    if (!el) return
    const distanceFromBottom =
      el.scrollHeight - (el.scrollTop + el.clientHeight)
    setFollow(distanceFromBottom < 24)
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-t border-[var(--surface-popover-border)]">
      <Toolbar
        entryCount={entries.length}
        pxPerMs={pxPerMs}
        setPxPerMs={setPxPerMs}
        follow={follow}
        setFollow={setFollow}
        onClear={() => setEntries([])}
      />
      <div className="grid shrink-0 grid-cols-2 border-b border-[var(--surface-popover-border)] text-[10px] font-semibold uppercase tracking-wider opacity-55">
        <div className="px-3 py-1">CLI</div>
        <div className="border-l border-[var(--surface-popover-border)] px-3 py-1">
          Director
        </div>
      </div>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-y-auto"
      >
        <div className="relative" style={{ height: totalHeight }}>
          {gridYs.map((y) => (
            <div
              key={`grid-${y}`}
              className="pointer-events-none absolute left-0 right-0 border-t border-[var(--surface-popover-border)] opacity-30"
              style={{ top: y }}
            />
          ))}
          {gapBreaks.map((gb, i) => (
            <GapBreak key={`gap-${i}`} topY={gb.topY} bottomY={gb.bottomY} dt={gb.dt} />
          ))}
          <div
            className="pointer-events-none absolute bottom-0 top-0 border-r border-[var(--surface-popover-border)]"
            style={{ left: '50%' }}
          />
          {layout.map(({ entry, y }) => (
            <TimelineRow key={entry.id} entry={entry} y={y} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Toolbar({
  entryCount,
  pxPerMs,
  setPxPerMs,
  follow,
  setFollow,
  onClear,
}: {
  entryCount: number
  pxPerMs: number
  setPxPerMs: (n: number) => void
  follow: boolean
  setFollow: (b: boolean) => void
  onClear: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 px-3 py-2 text-[11px]">
      <span className="font-semibold opacity-70">Timeline</span>
      <span className="opacity-55 tabular-nums">{entryCount} events</span>
      <label className="ml-2 flex items-center gap-1.5 opacity-70">
        scale
        <input
          type="range"
          min={0.02}
          max={0.6}
          step={0.01}
          value={pxPerMs}
          onChange={(e) => setPxPerMs(Number(e.target.value))}
          className="w-28 accent-blue-600"
        />
        <span className="w-12 text-right tabular-nums opacity-70">
          {pxPerMs.toFixed(2)} px/ms
        </span>
      </label>
      <label className="flex items-center gap-1 opacity-70">
        <input
          type="checkbox"
          checked={follow}
          onChange={(e) => setFollow(e.target.checked)}
        />
        follow
      </label>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto rounded border border-zinc-300 px-2 py-0.5 text-[11px] hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        Clear
      </button>
    </div>
  )
}

type PositionedEntry = { entry: PresenceDebugEntry; y: number }
type GapBreakRange = { topY: number; bottomY: number; dt: number }

function layoutEntries(
  entries: PresenceDebugEntry[],
  pxPerMs: number,
): {
  layout: PositionedEntry[]
  totalHeight: number
  gridYs: number[]
  gapBreaks: GapBreakRange[]
} {
  if (entries.length === 0) {
    return {
      layout: [],
      totalHeight: TOP_PAD_PX + BOTTOM_PAD_PX,
      gridYs: [],
      gapBreaks: [],
    }
  }

  // Merge-sort by time. Events share a compressed-time slot per distinct t,
  // so a CLI and director event at the same wall-clock t start on the same Y.
  const sorted = [...entries].sort((a, b) =>
    a.t === b.t ? a.id - b.id : a.t - b.t,
  )

  // Build a map t → cumulative compressed-ms. Gaps over GAP_THRESHOLD_MS
  // collapse to COMPRESSED_GAP_MS so quiet stretches don't dominate.
  const tToCompressed = new Map<number, number>()
  const compressedSpans: { beforeT: number; afterT: number; dt: number }[] = []
  let cumulative = 0
  let prevT: number | null = null
  for (const entry of sorted) {
    if (tToCompressed.has(entry.t)) continue
    if (prevT !== null) {
      const dt = entry.t - prevT
      if (dt > GAP_THRESHOLD_MS) {
        compressedSpans.push({ beforeT: prevT, afterT: entry.t, dt })
        cumulative += COMPRESSED_GAP_MS
      } else {
        cumulative += dt
      }
    }
    tToCompressed.set(entry.t, cumulative)
    prevT = entry.t
  }

  const lastCliY = { y: -Infinity }
  const lastDirY = { y: -Infinity }
  const layout: PositionedEntry[] = []
  for (const entry of entries) {
    const rawY = TOP_PAD_PX + (tToCompressed.get(entry.t) ?? 0) * pxPerMs
    const guard = entry.side === 'cli' ? lastCliY : lastDirY
    const y = Math.max(rawY, guard.y + MIN_ROW_PX)
    guard.y = y
    layout.push({ entry, y })
  }

  // For each compressed span, locate the visible Y range it occupies: from
  // the bottom of the latest event at beforeT to the top of the earliest
  // event at afterT.
  const gapBreaks: GapBreakRange[] = compressedSpans.map((span) => {
    let topY = -Infinity
    let bottomY = Infinity
    for (const { entry, y } of layout) {
      if (entry.t === span.beforeT) topY = Math.max(topY, y + ROW_HEIGHT_PX)
      if (entry.t === span.afterT) bottomY = Math.min(bottomY, y)
    }
    return { topY, bottomY, dt: span.dt }
  })

  const uniqueYs = new Set<number>()
  for (const { y } of layout) uniqueYs.add(Math.round(y))
  const gridYs = [...uniqueYs].sort((a, b) => a - b)

  const maxY = layout.reduce((m, e) => Math.max(m, e.y), TOP_PAD_PX)
  return {
    layout,
    totalHeight: maxY + ROW_HEIGHT_PX + BOTTOM_PAD_PX,
    gridYs,
    gapBreaks,
  }
}

function GapBreak({
  topY,
  bottomY,
  dt,
}: {
  topY: number
  bottomY: number
  dt: number
}) {
  const height = Math.max(0, bottomY - topY)
  if (height <= 0) return null
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 flex items-center justify-center"
      style={{ top: topY, height }}
    >
      <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-[var(--surface-popover-border)] opacity-60" />
      <span className="relative rounded bg-[var(--surface-panel)] px-1.5 text-[9px] uppercase tracking-wider opacity-70">
        {formatGap(dt)} idle
      </span>
    </div>
  )
}

function formatGap(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 1000)}s`
}

function TimelineRow({ entry, y }: { entry: PresenceDebugEntry; y: number }) {
  const isCli = entry.side === 'cli'
  const tone = toneFor(entry.kind)
  return (
    <div
      className="absolute flex items-center gap-2 overflow-hidden px-3 text-[11px] leading-[18px]"
      style={{
        top: y,
        left: isCli ? 0 : '50%',
        width: '50%',
        height: ROW_HEIGHT_PX,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: tone.dot }}
      />
      <span className="shrink-0 font-medium" style={{ color: tone.text }}>
        {entry.label}
      </span>
      {entry.detail ? (
        <span className="min-w-0 truncate opacity-55">{entry.detail}</span>
      ) : null}
    </div>
  )
}

function toneFor(kind: PresenceDebugEntry['kind']): {
  dot: string
  text: string
} {
  switch (kind) {
    case 'cli:emit':
      return { dot: '#2563eb', text: 'inherit' }
    case 'cli:sync-wait':
      return { dot: '#f59e0b', text: '#b45309' }
    case 'cli:sync-resolve':
      return { dot: '#16a34a', text: '#15803d' }
    case 'cli:box-resolve':
      return { dot: '#0ea5e9', text: '#0369a1' }
    case 'dir:apply':
      return { dot: '#8b5cf6', text: 'inherit' }
    case 'dir:phase':
      return { dot: '#64748b', text: 'inherit' }
    case 'dir:drop':
      return { dot: '#dc2626', text: '#b91c1c' }
  }
}
