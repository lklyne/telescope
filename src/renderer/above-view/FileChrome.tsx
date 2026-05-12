/**
 * FileChrome — per-file-entity chrome rendered in aboveView. Per ADR 0008 §6,
 * the chrome is identity-only: favicon + filename label, no actions. All
 * file actions (rename, wireframe theme, json toggle, dup, del) live in the
 * `FilePopup`, dispatched through the renderer plugin contribution surface
 * (ADR 0008 §7).
 */

import { memo } from 'react'
import type {
  CanvasBgElectronAPI,
  CanvasSceneFileEntity,
  LayoutUpdateData,
} from '../../shared/types'
import { MARKDOWN_EXTENSIONS, WIREFRAME_EXTENSIONS } from '../canvas-bg/entityConstants'
import { CanvasItemChrome } from './CanvasItemChrome'
import { iconForFilePath } from '../shared/fileIcon'

export function FileChromeOverlay({
  api,
  layoutData,
  isDark,
}: {
  api: CanvasBgElectronAPI
  layoutData: LayoutUpdateData
  isDark: boolean
}) {
  if (layoutData.viewMode !== 'canvas') return null
  const fileEntities = layoutData.entities.filter(
    (e): e is CanvasSceneFileEntity => e.kind === 'file',
  )
  const isIdle = layoutData.interaction.kind === 'idle'
  const selectedEntityId =
    layoutData.selectedEntityIds.length === 1 ? layoutData.selectedEntityIds[0] : null
  const hoveredEntityId = layoutData.hover?.id ?? null
  return (
    <>
      {fileEntities.map((entity) => (
        <FileChromeItem
          key={entity.id}
          api={api}
          layoutData={layoutData}
          entity={entity}
          isDark={isDark}
          isActive={(entity.id === selectedEntityId && isIdle) || entity.id === hoveredEntityId}
        />
      ))}
    </>
  )
}

const FileChromeItem = memo(function FileChromeItem({
  api,
  layoutData,
  entity,
  isDark,
  isActive,
}: {
  api: CanvasBgElectronAPI
  layoutData: LayoutUpdateData
  entity: CanvasSceneFileEntity
  isDark: boolean
  isActive: boolean
}) {
  const fileName = entity.file.split('/').pop() ?? entity.file
  const displayName = WIREFRAME_EXTENSIONS.test(entity.file)
    ? fileName.replace(/\.wireframe\.json$/i, '')
    : MARKDOWN_EXTENSIONS.test(entity.file)
      ? fileName.replace(/\.md$/i, '')
      : fileName
  const FileIcon = iconForFilePath(entity.file)

  const onPointerDown = (event: React.PointerEvent) => {
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
      api.selectEntity(entity.id, 'file', modifiers)
      return
    }
    const preserve = layoutData.selectedEntityIds.includes(entity.id)
    api.startDragEntity(entity.id, { entityKind: 'file', preserveSelection: preserve })
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
      api.endDragEntity()
    }
    const onMove = (me: PointerEvent) => {
      if (me.pointerId !== pointerId) return
      const dx = me.screenX - lastX
      const dy = me.screenY - lastY
      lastX = me.screenX
      lastY = me.screenY
      if (dx !== 0 || dy !== 0) api.dragEntity(entity.id, dx, dy)
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

  return (
    <CanvasItemChrome.Root
      entityId={entity.id}
      layout={layoutData}
      isDark={isDark}
      isActive={isActive}
      onPointerDown={onPointerDown}
      onMouseEnter={() => api.hoverPage(entity.id)}
      onMouseLeave={() => api.hoverPage(null)}
    >
      <CanvasItemChrome.DragTrigger>
        <FileIcon size={13} className="shrink-0 text-zinc-400" />
        <CanvasItemChrome.Title>{displayName}</CanvasItemChrome.Title>
      </CanvasItemChrome.DragTrigger>
    </CanvasItemChrome.Root>
  )
})
