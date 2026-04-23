/**
 * useDragGesture — the single renderer-side gesture primitive.
 *
 * Spec §4.6. Pointer events only (invariant I8). setPointerCapture
 * so the gesture survives leaving the target element. Automatic
 * cancellation on:
 *   - window blur with no buttons held (a blur storm, not an
 *     intentional drag continuation)
 *   - Escape
 *   - pointercancel / lostpointercapture
 *
 * Callers provide onBegin/onUpdate/onCommit/onCancel. `onBegin` can
 * return null to decline (the event bubbles normally). The hook
 * handles the threshold, capture lifecycle, and cleanup — no caller
 * needs to touch raw pointer events.
 *
 * `GestureContext` is given in client-space by default. Callers that
 * need canvas-space convert via `src/shared/coords.ts`.
 */

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

export type CancelReason = 'blur' | 'escape' | 'pointercancel' | 'lostcapture' | 'external'

export type GestureContext = {
  clientX: number
  clientY: number
  startClientX: number
  startClientY: number
  dx: number
  dy: number
  buttons: number
  modifiers: { shift: boolean; meta: boolean; alt: boolean; ctrl: boolean }
  pointerType: string
  button: number
}

export type DragGestureSpec<T> = {
  target: RefObject<HTMLElement | null>
  /** Pixels of movement before begin fires. Defaults to 0 (begin on pointerdown). */
  threshold?: number
  onBegin: (ctx: GestureContext) => T | null
  onUpdate: (ctx: GestureContext, token: T) => void
  onCommit: (ctx: GestureContext, token: T) => void
  onCancel: (token: T, reason: CancelReason) => void
  /** Runs after an accepted pointerdown, even when threshold prevents begin. */
  onPointerDown?: (ctx: GestureContext) => void
  /** Filter pointerdown events before they start a gesture. */
  filter?: (event: PointerEvent) => boolean
  /** Stop propagation of accepted pointerdown events (prevents ancestor gestures). */
  stopPropagation?: boolean
}

function contextFrom(
  event: PointerEvent,
  startClientX: number,
  startClientY: number,
): GestureContext {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    startClientX,
    startClientY,
    dx: event.clientX - startClientX,
    dy: event.clientY - startClientY,
    buttons: event.buttons,
    modifiers: {
      shift: event.shiftKey,
      meta: event.metaKey,
      alt: event.altKey,
      ctrl: event.ctrlKey,
    },
    pointerType: event.pointerType,
    button: event.button,
  }
}

export function useDragGesture<T>(spec: DragGestureSpec<T>): void {
  const specRef = useRef(spec)
  specRef.current = spec

  useEffect(() => {
    const el = spec.target.current
    if (!el) return

    let pointerId: number | null = null
    let startX = 0
    let startY = 0
    let token: T | null = null
    let begun = false
    let lastButtons = 0
    const cancel = (reason: CancelReason) => {
      if (token !== null) {
        try { specRef.current.onCancel(token, reason) } catch { /* ignore */ }
      }
      if (pointerId !== null && el.hasPointerCapture(pointerId)) {
        try { el.releasePointerCapture(pointerId) } catch { /* ignore */ }
      }
      pointerId = null
      token = null
      begun = false
    }

    const onPointerDown = (event: PointerEvent) => {
      if (pointerId !== null) return
      if (specRef.current.filter && !specRef.current.filter(event)) return
      if (specRef.current.stopPropagation) event.stopPropagation()
      pointerId = event.pointerId
      startX = event.clientX
      startY = event.clientY
      lastButtons = event.buttons
      specRef.current.onPointerDown?.(contextFrom(event, startX, startY))
      el.setPointerCapture(event.pointerId)
      const threshold = specRef.current.threshold ?? 0
      if (threshold === 0) {
        const ctx = contextFrom(event, startX, startY)
        const t = specRef.current.onBegin(ctx)
        if (t === null) { cancel('external'); return }
        token = t
        begun = true
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      lastButtons = event.buttons
      const ctx = contextFrom(event, startX, startY)
      if (!begun) {
        const threshold = specRef.current.threshold ?? 0
        if (Math.abs(ctx.dx) < threshold && Math.abs(ctx.dy) < threshold) return
        const t = specRef.current.onBegin(ctx)
        if (t === null) { cancel('external'); return }
        token = t
        begun = true
        return
      }
      if (token !== null) specRef.current.onUpdate(ctx, token)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      const ctx = contextFrom(event, startX, startY)
      if (begun && token !== null) {
        try { specRef.current.onCommit(ctx, token) } catch { /* ignore */ }
      }
      if (el.hasPointerCapture(event.pointerId)) {
        el.releasePointerCapture(event.pointerId)
      }
      pointerId = null
      token = null
      begun = false
    }

    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId === pointerId) cancel('pointercancel')
    }

    const onLostCapture = (event: PointerEvent) => {
      if (event.pointerId === pointerId) cancel('lostcapture')
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && pointerId !== null) cancel('escape')
    }

    const onBlur = () => {
      // Per spec §4.6: cancel only on a "blur storm" — the window lost focus
      // with no buttons held, meaning pointerup was never seen. If buttons
      // are still held, focus moved legitimately (e.g. FocusReconciler
      // handing focus to aboveView mid-gesture); pointer capture keeps the
      // event stream flowing and the gesture continues.
      if (pointerId !== null && lastButtons === 0) cancel('blur')
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerCancel)
    el.addEventListener('lostpointercapture', onLostCapture)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onBlur)

    return () => {
      cancel('external')
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerCancel)
      el.removeEventListener('lostpointercapture', onLostCapture)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
    }
  }, [spec.target])
}
