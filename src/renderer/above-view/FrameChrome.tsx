/**
 * FrameChrome — per-frame chrome (URL bar, back/forward/reload/menu) rendered
 * in aboveView. Per ADR 0002 §2 every canvas-anchored chrome lives here so
 * the router yields via `data-overlay-ui` and the gate predicate can stay
 * default-open in canvas mode.
 */

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, EllipsisVertical, RotateCw, Search } from 'lucide-react'
import type {
  CanvasBgElectronAPI,
  CanvasSceneFrameEntity,
  LayoutUpdateData,
} from '../../shared/types'
import { normalizeUserUrl } from '../../shared/url'
import { CanvasItemChrome } from './CanvasItemChrome'
import { InlineEditLabel } from '../shared/InlineEditLabel'

export function FrameChromeOverlay({
  api,
  layoutData,
  isDark,
}: {
  api: CanvasBgElectronAPI
  layoutData: LayoutUpdateData
  isDark: boolean
}) {
  if (layoutData.viewMode !== 'canvas') return null
  const frames = layoutData.entities.filter(
    (e): e is CanvasSceneFrameEntity => e.kind === 'frame',
  )
  const isIdle = layoutData.interaction.kind === 'idle'
  const selectedFrameId =
    layoutData.selectedEntityIds.length === 1 ? layoutData.selectedEntityIds[0] : null
  const hoveredFrameId = layoutData.hover?.id ?? null
  const dragEnabled = layoutData.annotationMode !== 'region_select'
  return (
    <>
      {frames.map((frame) => (
        <FrameChromeItem
          key={frame.id}
          api={api}
          layoutData={layoutData}
          frame={frame}
          isDark={isDark}
          isSelected={frame.id === selectedFrameId && isIdle}
          isActive={(frame.id === selectedFrameId && isIdle) || frame.id === hoveredFrameId}
          dragEnabled={dragEnabled}
        />
      ))}
    </>
  )
}

function FrameChromeItem({
  api,
  layoutData,
  frame,
  isDark,
  isSelected,
  isActive,
  dragEnabled,
}: {
  api: CanvasBgElectronAPI
  layoutData: LayoutUpdateData
  frame: CanvasSceneFrameEntity
  isDark: boolean
  isSelected: boolean
  isActive: boolean
  dragEnabled: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)
  const isBlank = frame.url === 'about:blank' && !pendingUrl

  useEffect(() => {
    setPendingUrl(null)
  }, [frame.url])

  const editValue = isBlank ? '' : frame.url
  const displayValue = isBlank ? 'Type a URL' : frame.label || pendingUrl || frame.url

  const handleCommitUrl = (next: string) => {
    const trimmed = next.trim()
    if (trimmed && trimmed !== frame.url) {
      const normalized = normalizeUserUrl(trimmed)
      setPendingUrl(normalized)
      api.navigateFrame(frame.id, normalized)
    }
    setIsEditing(false)
  }

  const faviconIcon = isBlank ? (
    <Search size={13} className="shrink-0 text-zinc-400" />
  ) : frame.faviconUrl ? (
    <img
      alt=""
      aria-hidden="true"
      src={frame.faviconUrl}
      className="h-3.5 w-3.5 shrink-0 rounded-[3px]"
    />
  ) : null

  const onPointerDown = !isEditing
    ? (event: React.PointerEvent) => {
        const target = event.target as HTMLElement
        if (target.closest('[data-frame-context-menu]')) return
        event.preventDefault()
        event.stopPropagation()
        const pointerId = event.pointerId
        const captureTarget = event.currentTarget
        try {
          captureTarget.setPointerCapture(pointerId)
        } catch {
          /* ignore */
        }
        const additive = event.shiftKey || event.metaKey || event.ctrlKey
        const modifiers = { shift: event.shiftKey, meta: event.metaKey, ctrl: event.ctrlKey }
        if (additive) {
          api.selectFrame(frame.id, modifiers)
          return
        }
        const preserve = layoutData.selectedEntityIds.includes(frame.id)
        if (!preserve) api.selectFrame(frame.id)
        api.startDragFrame(frame.id)
        let lastX = event.screenX
        let lastY = event.screenY
        const cleanup = () => {
          try {
            if (captureTarget.hasPointerCapture(pointerId)) {
              captureTarget.releasePointerCapture(pointerId)
            }
          } catch {
            /* ignore */
          }
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          window.removeEventListener('pointercancel', onCancel)
          window.removeEventListener('blur', onCancel)
        }
        const finish = () => {
          cleanup()
          api.endDragFrame()
        }
        const onMove = (me: PointerEvent) => {
          if (me.pointerId !== pointerId) return
          const dx = me.screenX - lastX
          const dy = me.screenY - lastY
          lastX = me.screenX
          lastY = me.screenY
          if (dx !== 0 || dy !== 0) api.dragFrame(frame.id, dx, dy)
        }
        const onUp = (me: PointerEvent) => {
          if (me.pointerId !== pointerId) return
          finish()
        }
        const onCancel = () => finish()
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onCancel)
        window.addEventListener('blur', onCancel)
      }
    : undefined

  return (
    <CanvasItemChrome.Root
      entityId={frame.id}
      layout={layoutData}
      isDark={isDark}
      isActive={isActive}
      dragEnabled={dragEnabled}
      onPointerDown={onPointerDown}
      onMouseEnter={() => api.hoverFrame(frame.id)}
      onMouseLeave={() => api.hoverFrame(null)}
    >
      <CanvasItemChrome.DragTrigger
        onPointerDown={isEditing ? (e) => e.stopPropagation() : undefined}
      >
        {faviconIcon}
        <InlineEditLabel
          value={editValue}
          displayValue={displayValue}
          isEditing={isEditing}
          onStartEdit={isSelected ? () => setIsEditing(true) : undefined}
          onCommit={handleCommitUrl}
          onCancel={() => setIsEditing(false)}
          variant="canvas-chrome"
          isDark={isDark}
          placeholder={isBlank ? 'Type a URL' : frame.url}
          titleClassName={`min-w-0 truncate font-medium ${isBlank ? 'text-zinc-400' : ''}`}
          onTitleClick={isSelected ? () => setIsEditing(true) : undefined}
        />
      </CanvasItemChrome.DragTrigger>

      {!isEditing && (
        <CanvasItemChrome.Actions>
          <CanvasItemChrome.Button
            title="Back"
            disabled={!frame.canGoBack}
            style={!frame.canGoBack ? { opacity: 0.3 } : undefined}
            onClick={() => api.goBackFrame(frame.id)}
          >
            <ChevronLeft size={13} />
          </CanvasItemChrome.Button>
          <CanvasItemChrome.Button
            title="Forward"
            disabled={!frame.canGoForward}
            style={!frame.canGoForward ? { opacity: 0.3 } : undefined}
            onClick={() => api.goForwardFrame(frame.id)}
          >
            <ChevronRight size={13} />
          </CanvasItemChrome.Button>
          <CanvasItemChrome.Button
            title={frame.isLoading ? 'Loading…' : 'Reload'}
            onClick={() => api.reloadFrame(frame.id)}
          >
            <RotateCw size={11} className={frame.isLoading ? 'animate-spin' : ''} />
          </CanvasItemChrome.Button>
          <CanvasItemChrome.Button
            title="Frame actions"
            onClick={() => api.showFrameContextMenu(frame.id)}
          >
            <EllipsisVertical size={13} />
          </CanvasItemChrome.Button>
        </CanvasItemChrome.Actions>
      )}
    </CanvasItemChrome.Root>
  )
}
