import { useEffect, useMemo, useState } from 'react'
import { DRAWING_FEATURE_ENABLED } from '../../shared/featureFlags'
import type {
  CanvasBgElectronAPI,
  CanvasSceneDrawingEntity,
  LayoutUpdateData,
} from '../../shared/types'
import { DrawingInlineMenu } from './DrawingInlineMenu'

/**
 * FloatingUiLayer — inline menus for selected drawing entities.
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

  // Menus position themselves by screen coords. above-view's WCV starts
  // at y=canvasOrigin.y; translate screenY into within-WCV space.
  const originY = layoutData.canvasOrigin.y

  const drawing = useMemo(() => {
    if (!selectedDrawingEntity) return null
    return {
      ...selectedDrawingEntity,
      screenY: selectedDrawingEntity.screenY - originY,
    }
  }, [selectedDrawingEntity, originY])

  if (!(DRAWING_FEATURE_ENABLED && drawing)) return null

  return (
    <>
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
  if (layoutData.viewMode !== 'canvas') return false
  if (layoutData.selectedEntityIds.length !== 1) return false
  const [id] = layoutData.selectedEntityIds
  return layoutData.entities.some(
    (e) => e.id === id && e.kind === 'drawing',
  )
}
