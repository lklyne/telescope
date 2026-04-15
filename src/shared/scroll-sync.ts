import type { ScrollSyncData } from './types'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function maxScrollLeft(): number {
  return Math.max(
    0,
    (document.documentElement?.scrollWidth ?? 0) - window.innerWidth,
    (document.body?.scrollWidth ?? 0) - window.innerWidth,
  )
}

function maxScrollTop(): number {
  return Math.max(
    0,
    (document.documentElement?.scrollHeight ?? 0) - window.innerHeight,
    (document.body?.scrollHeight ?? 0) - window.innerHeight,
  )
}

export function createScrollSyncData(): ScrollSyncData {
  const xMax = maxScrollLeft()
  const yMax = maxScrollTop()

  return {
    xProgress: xMax > 0 ? window.scrollX / xMax : 0,
    yProgress: yMax > 0 ? window.scrollY / yMax : 0,
    sourceUrl: window.location.href,
  }
}

export function resolveScrollTop(data: ScrollSyncData): number {
  return maxScrollTop() * clamp(data.yProgress, 0, 1)
}

