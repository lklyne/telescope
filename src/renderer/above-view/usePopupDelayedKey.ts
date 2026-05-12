// ADR 0008 — shared primitives for canvas-item popups (mount delay,
// shared-property collapse).

import { useEffect, useState } from 'react'
import { POPUP_SHOW_DELAY_MS } from '../../shared/popupTiming'

export const POPUP_OFFSET_Y = 14

export function usePopupDelayedKey(ids: string, shouldQueue: boolean): boolean {
  const [delayedKey, setDelayedKey] = useState<string | null>(null)
  useEffect(() => {
    if (!shouldQueue) {
      setDelayedKey(null)
      return
    }
    const timeoutId = window.setTimeout(() => {
      setDelayedKey(ids)
    }, POPUP_SHOW_DELAY_MS)
    return () => window.clearTimeout(timeoutId)
  }, [shouldQueue, ids])
  return delayedKey === ids && ids !== ''
}

export function sharedValue<T>(values: readonly T[]): T | null {
  if (values.length === 0) return null
  const first = values[0]
  return values.every((v) => v === first) ? first : null
}
