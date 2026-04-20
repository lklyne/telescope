import { useEffect, useMemo, useState } from 'react'
import { DRAWING_FEATURE_ENABLED } from '../../shared/featureFlags'
import type {
  CanvasBgElectronAPI,
  CanvasSceneDrawingEntity,
  CanvasSceneTextEntity,
  LayoutUpdateData,
} from '../../shared/types'
import { SELECTED_FRAME_MENU_SHOW_DELAY_MS } from '../../shared/selectedFrameMenu'
import { StickyNoteInlineMenu } from '../canvas-bg/InlineEntityMenu'
import { DrawingInlineMenu } from './DrawingInlineMenu'

/**
 * FloatingUiLayer — inline menus for selected text / drawing entities.
 *
 * Merged from the retired `floating-ui/` bundle. Reads `layoutData`
 * directly (no separate `floating-ui-update` IPC needed — above-view
 * already has the data via canvas-bg's `layout-update`). Positioned
 * inside above-view's full-canvas coordinate space; the menu's own
 * components have `pointer-events-auto` while the surrounding above-view
 * stays `pointer-events-none` when idle.
 */
export function FloatingUiLayer({
  api,
  isDark,
  layoutData,
}: {
  api: CanvasBgElectronAPI
  isDark: boolean
  layoutData: LayoutUpdateData
}) {
  const selectedTextEntity = useMemo(() => {
    if (layoutData.selectedEntityIds.length !== 1) return null
    const [selectedId] = layoutData.selectedEntityIds
    return (
      layoutData.entities.find(
        (entity): entity is CanvasSceneTextEntity =>
          entity.kind === 'text' && entity.id === selectedId,
      ) ?? null
    )
  }, [layoutData.entities, layoutData.selectedEntityIds])

  const selectedDrawingEntity = useMemo(() => {
    if (layoutData.selectedEntityIds.length !== 1) return null
    const [selectedId] = layoutData.selectedEntityIds
    return (
      layoutData.entities.find(
        (entity): entity is CanvasSceneDrawingEntity =>
          entity.kind === 'drawing' && entity.id === selectedId,
      ) ?? null
    )
  }, [layoutData.entities, layoutData.selectedEntityIds])

  const [delayedTextMenuId, setDelayedTextMenuId] = useState<string | null>(null)
  const shouldQueueTextMenu =
    layoutData.focusedEntityId === null &&
    layoutData.interaction.kind === 'idle' &&
    selectedTextEntity !== null

  useEffect(() => {
    if (!shouldQueueTextMenu || !selectedTextEntity) {
      setDelayedTextMenuId(null)
      return
    }
    const timeoutId = window.setTimeout(() => {
      setDelayedTextMenuId(selectedTextEntity.id)
    }, SELECTED_FRAME_MENU_SHOW_DELAY_MS)
    return () => window.clearTimeout(timeoutId)
  }, [selectedTextEntity, shouldQueueTextMenu])

  // Menus position themselves by screen coords. above-view's WCV starts
  // at y=canvasOrigin.y; translate screenY into within-WCV space.
  const originY = layoutData.canvasOrigin.y

  const textNote = useMemo(() => {
    if (!selectedTextEntity) return null
    return {
      ...selectedTextEntity,
      screenY: selectedTextEntity.screenY - originY,
    }
  }, [selectedTextEntity, originY])

  const drawing = useMemo(() => {
    if (!selectedDrawingEntity) return null
    return {
      ...selectedDrawingEntity,
      screenY: selectedDrawingEntity.screenY - originY,
    }
  }, [selectedDrawingEntity, originY])

  const showTextEntityMenu = textNote !== null && delayedTextMenuId === textNote.id

  if (!showTextEntityMenu && !(DRAWING_FEATURE_ENABLED && drawing)) return null

  return (
    <>
      {showTextEntityMenu && textNote ? (
        <StickyNoteInlineMenu
          isDark={isDark}
          note={textNote}
          onDuplicate={() => api.duplicateTextEntity(textNote.id)}
          onDelete={() => api.deleteTextEntity(textNote.id)}
          onSelectColor={(color) => api.updateTextEntity(textNote.id, { color })}
        />
      ) : null}
      {DRAWING_FEATURE_ENABLED && drawing ? (
        <DrawingInlineMenu
          drawing={drawing}
          isDark={isDark}
          onDelete={() => api.deleteDrawingEntity(drawing.id)}
        />
      ) : null}
    </>
  )
}

/** Predicate for whether the floating UI should be visible (drives overlayActive). */
export function hasFloatingMenu(layoutData: LayoutUpdateData): boolean {
  if (layoutData.focusedEntityId !== null) return false
  if (layoutData.selectedEntityIds.length !== 1) return false
  const [id] = layoutData.selectedEntityIds
  return layoutData.entities.some(
    (e) => e.id === id && (e.kind === 'text' || e.kind === 'drawing'),
  )
}
