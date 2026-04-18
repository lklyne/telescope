/**
 * Two-column narration timeline: CLI dispatches on the left, director activity
 * on the right, positioned vertically by wall-clock time. Newest at the bottom
 * so the column scrolls upward like a live log.
 *
 * Vertical distance between entries reflects real elapsed time — quiet periods
 * leave visible gaps. The pxPerMs slider retargets the scale so bursty work is
 * legible and long idle periods don't dominate the view.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { NarrationDebugEntry } from '../../shared/types'

const DEFAULT_PX_PER_MS = 0.12
const MIN_ROW_PX = 18
const ROW_HEIGHT_PX = 22
const TOP_PAD_PX = 12
const BOTTOM_PAD_PX = 32

export function NarrationTimelinePanel({
  initialEntries,
  subscribe,
}: {
  initialEntries: NarrationDebugEntry[]
  subscribe: (cb: (entry: NarrationDebugEntry) => void) => () => void
}) {
  const [entries, setEntries] = useState<NarrationDebugEntry[]>(initialEntries)
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
  const { layout, totalHeight } = useMemo(
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

type PositionedEntry = { entry: NarrationDebugEntry; y: number }

function layoutEntries(
  entries: NarrationDebugEntry[],
  pxPerMs: number,
): { layout: PositionedEntry[]; totalHeight: number } {
  if (entries.length === 0) {
    return { layout: [], totalHeight: TOP_PAD_PX + BOTTOM_PAD_PX }
  }
  const t0 = entries[0].t
  const lastCliY = { y: -Infinity }
  const lastDirY = { y: -Infinity }
  const layout: PositionedEntry[] = []
  for (const entry of entries) {
    const rawY = TOP_PAD_PX + (entry.t - t0) * pxPerMs
    const guard = entry.side === 'cli' ? lastCliY : lastDirY
    const y = Math.max(rawY, guard.y + MIN_ROW_PX)
    guard.y = y
    layout.push({ entry, y })
  }
  const maxY = layout.reduce((m, e) => Math.max(m, e.y), TOP_PAD_PX)
  return { layout, totalHeight: maxY + ROW_HEIGHT_PX + BOTTOM_PAD_PX }
}

function TimelineRow({ entry, y }: { entry: NarrationDebugEntry; y: number }) {
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

function toneFor(kind: NarrationDebugEntry['kind']): {
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
    case 'dir:apply':
      return { dot: '#8b5cf6', text: 'inherit' }
    case 'dir:phase':
      return { dot: '#64748b', text: 'inherit' }
    case 'dir:drop':
      return { dot: '#dc2626', text: '#b91c1c' }
  }
}
