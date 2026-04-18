import { Fragment, useEffect, useRef } from 'react'
import type { FixProgressEvent } from '../../shared/types'

const kindColor: Record<FixProgressEvent['kind'], string> = {
  system: 'text-zinc-500',
  text: 'text-zinc-800 dark:text-zinc-200',
  tool_use: 'text-blue-700 dark:text-blue-300',
  tool_result: 'text-emerald-700 dark:text-emerald-300',
  result: 'text-zinc-900 dark:text-zinc-100',
  stderr: 'text-amber-700 dark:text-amber-300',
  error: 'text-red-700 dark:text-red-300',
}

export function FixEventList({
  events,
  className,
}: {
  events: FixProgressEvent[]
  className?: string
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const eventCount = events.length

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [eventCount])

  return (
    <div
      ref={scrollRef}
      className={`grid auto-rows-min grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0 overflow-auto font-mono text-[11px] leading-relaxed ${className ?? ''}`}
    >
      {events.map((event, i) => (
        <Fragment key={`${event.timestamp}-${i}`}>
          <span className="text-zinc-400 dark:text-zinc-600">
            {event.kind.replace('_', ' ')}
          </span>
          <span className={`break-words ${kindColor[event.kind]}`}>
            {event.text}
          </span>
        </Fragment>
      ))}
    </div>
  )
}
