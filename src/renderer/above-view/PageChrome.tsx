/**
 * PageChrome — per-page chrome (URL bar, back/forward/reload/menu) rendered
 * in aboveView. Per ADR 0002 §2 every canvas-anchored chrome lives here so
 * the router yields via `data-overlay-ui` and the gate predicate can stay
 * default-open in canvas mode.
 */

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, EllipsisVertical, RotateCw, Search } from 'lucide-react'
import type {
  CanvasBgElectronAPI,
  CanvasScenePageEntity,
  LayoutUpdateData,
} from '../../shared/types'
import { normalizeUserUrl } from '../../shared/url'
import { CanvasItemChrome } from './CanvasItemChrome'
import { InlineEditLabel } from '../shared/InlineEditLabel'

export function PageChromeOverlay({
  api,
  layoutData,
  isDark,
}: {
  api: CanvasBgElectronAPI
  layoutData: LayoutUpdateData
  isDark: boolean
}) {
  if (layoutData.viewMode !== 'canvas') return null
  const pages = layoutData.entities.filter(
    (e): e is CanvasScenePageEntity => e.kind === 'page',
  )
  const isIdle = layoutData.interaction.kind === 'idle'
  const selectedPageId =
    layoutData.selectedEntityIds.length === 1 ? layoutData.selectedEntityIds[0] : null
  const hoveredPageId = layoutData.hover?.id ?? null
  const dragEnabled = layoutData.activeTool.kind !== 'region-select'
  return (
    <>
      {pages.map((page) => (
        <PageChromeItem
          key={page.id}
          api={api}
          layoutData={layoutData}
          page={page}
          isDark={isDark}
          isSelected={page.id === selectedPageId && isIdle}
          isActive={(page.id === selectedPageId && isIdle) || page.id === hoveredPageId}
          dragEnabled={dragEnabled}
        />
      ))}
    </>
  )
}

function PageChromeItem({
  api,
  layoutData,
  page,
  isDark,
  isSelected,
  isActive,
  dragEnabled,
}: {
  api: CanvasBgElectronAPI
  layoutData: LayoutUpdateData
  page: CanvasScenePageEntity
  isDark: boolean
  isSelected: boolean
  isActive: boolean
  dragEnabled: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)
  const isBlank = page.url === 'about:blank' && !pendingUrl

  useEffect(() => {
    setPendingUrl(null)
  }, [page.url])

  const editValue = isBlank ? '' : page.url
  const displayValue = isBlank ? 'Type a URL' : page.label || pendingUrl || page.url

  const handleCommitUrl = (next: string) => {
    const trimmed = next.trim()
    if (trimmed && trimmed !== page.url) {
      const normalized = normalizeUserUrl(trimmed)
      setPendingUrl(normalized)
      api.navigatePage(page.id, normalized)
    }
    setIsEditing(false)
  }

  const faviconIcon = isBlank ? (
    <Search size={13} className="shrink-0 text-zinc-400" />
  ) : page.faviconUrl ? (
    <img
      alt=""
      aria-hidden="true"
      src={page.faviconUrl}
      className="h-3.5 w-3.5 shrink-0 rounded-[3px]"
    />
  ) : null

  const onPointerDown = !isEditing
    ? (event: React.PointerEvent) => {
        const target = event.target as HTMLElement
        if (target.closest('[data-page-context-menu]')) return
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
          api.selectPage(page.id, modifiers)
          return
        }
        const preserve = layoutData.selectedEntityIds.includes(page.id)
        api.startDragPage(page.id, { entityKind: 'page', preserveSelection: preserve })
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
          api.endDragPage()
        }
        const onMove = (me: PointerEvent) => {
          if (me.pointerId !== pointerId) return
          const dx = me.screenX - lastX
          const dy = me.screenY - lastY
          lastX = me.screenX
          lastY = me.screenY
          if (dx !== 0 || dy !== 0) api.dragPage(page.id, dx, dy)
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
      entityId={page.id}
      layout={layoutData}
      isDark={isDark}
      isActive={isActive}
      dragEnabled={dragEnabled}
      onPointerDown={onPointerDown}
      onMouseEnter={() => api.hoverPage(page.id)}
      onMouseLeave={() => api.hoverPage(null)}
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
          placeholder={isBlank ? 'Type a URL' : page.url}
          titleClassName={`min-w-0 truncate font-medium ${isBlank ? 'text-zinc-400' : ''}`}
          onTitleClick={isSelected ? () => setIsEditing(true) : undefined}
        />
      </CanvasItemChrome.DragTrigger>

      {!isEditing && (
        <CanvasItemChrome.Actions>
          <CanvasItemChrome.Button
            title="Back"
            disabled={!page.canGoBack}
            style={!page.canGoBack ? { opacity: 0.3 } : undefined}
            onClick={() => api.goBackPage(page.id)}
          >
            <ChevronLeft size={13} />
          </CanvasItemChrome.Button>
          <CanvasItemChrome.Button
            title="Forward"
            disabled={!page.canGoForward}
            style={!page.canGoForward ? { opacity: 0.3 } : undefined}
            onClick={() => api.goForwardPage(page.id)}
          >
            <ChevronRight size={13} />
          </CanvasItemChrome.Button>
          <CanvasItemChrome.Button
            title={page.isLoading ? 'Loading…' : 'Reload'}
            onClick={() => api.reloadPage(page.id)}
          >
            <RotateCw size={11} className={page.isLoading ? 'animate-spin' : ''} />
          </CanvasItemChrome.Button>
          <CanvasItemChrome.Button
            title="Page actions"
            onClick={() => api.showPageContextMenu(page.id)}
          >
            <EllipsisVertical size={13} />
          </CanvasItemChrome.Button>
        </CanvasItemChrome.Actions>
      )}
    </CanvasItemChrome.Root>
  )
}
