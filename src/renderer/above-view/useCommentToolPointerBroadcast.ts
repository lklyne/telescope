/**
 * Comment-tool page-paints contract (ADR 0006). While the comment tool is
 * active, broadcast the pointer's window-coord position to main so each page
 * can paint a hover preview directly in its own DOM. The marquee rect is
 * piped in by the in-flight drag handler via `setRegionRect`; until then the
 * broadcast carries pointer-only state.
 *
 * Lifecycle:
 *   - tool active → emit on every pointermove + region-rect update
 *   - tool deactivated, pointer leaves window, or component unmounts →
 *     emit a single `null` clear so pages drop their overlays
 */

import { useEffect, useRef } from 'react'
import type { CanvasBgElectronAPI, LayoutUpdateData } from '../../shared/types'

type PointerStateApi = Pick<CanvasBgElectronAPI, 'setCommentToolPointerState'>

export type CommentToolPointerBroadcast = {
  setRegionRect: (
    rect: { x: number; y: number; width: number; height: number } | null,
  ) => void
  clear: () => void
}

export function useCommentToolPointerBroadcast({
  api,
  layoutRef,
  active,
}: {
  api: PointerStateApi
  layoutRef: React.MutableRefObject<LayoutUpdateData>
  active: boolean
}): CommentToolPointerBroadcast {
  const lastPointerRef = useRef<{ windowX: number; windowY: number } | null>(null)
  const regionRectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const lastSentRef = useRef<string | null>(null)
  const activeRef = useRef(active)

  const send = (
    pointer: { windowX: number; windowY: number } | null,
    region: { x: number; y: number; width: number; height: number } | null,
  ) => {
    if (!pointer && !region) {
      if (lastSentRef.current === null) return
      lastSentRef.current = null
      api.setCommentToolPointerState(null)
      return
    }
    const payload = pointer
      ? { windowX: pointer.windowX, windowY: pointer.windowY, regionRect: region }
      : null
    if (!payload) {
      if (lastSentRef.current === null) return
      lastSentRef.current = null
      api.setCommentToolPointerState(null)
      return
    }
    const key = `${payload.windowX}:${payload.windowY}:${
      region ? `${region.x},${region.y},${region.width},${region.height}` : 'null'
    }`
    if (key === lastSentRef.current) return
    lastSentRef.current = key
    api.setCommentToolPointerState(payload)
  }

  useEffect(() => {
    activeRef.current = active
    if (!active) {
      lastPointerRef.current = null
      regionRectRef.current = null
      send(null, null)
      return
    }
    const onMove = (event: PointerEvent) => {
      const layout = layoutRef.current
      const pointer = {
        windowX: event.clientX,
        windowY: event.clientY + layout.canvasOrigin.y,
      }
      lastPointerRef.current = pointer
      send(pointer, regionRectRef.current)
    }
    const onLeave = () => {
      lastPointerRef.current = null
      send(null, null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
      lastPointerRef.current = null
      regionRectRef.current = null
      send(null, null)
    }
  }, [active, api, layoutRef])

  return {
    setRegionRect: (rect) => {
      regionRectRef.current = rect
      if (!activeRef.current) return
      send(lastPointerRef.current, rect)
    },
    clear: () => {
      lastPointerRef.current = null
      regionRectRef.current = null
      send(null, null)
    },
  }
}
