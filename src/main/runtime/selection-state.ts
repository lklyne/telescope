import type { CanvasEntityKind } from '../../shared/types'
import {
  pages,
  pan,
  setHoverTarget,
  zoom,
} from './runtime-context'
import { activeWorkspaceTabId, workspaceTabs } from './workspace-model'
import {
  clearFocus as setUiClearFocus,
  devtoolsPanelTab as uiDevtoolsPanelTab,
  focusedEntity as uiFocusedEntity,
  pendingPlacement as uiPendingPlacement,
  selectedEntityIds as uiSelectedEntityIds,
  selectedPageIndex as uiSelectedPageIndex,
  setDevtoolsPanelTab as setUiDevtoolsPanelTab,
  setFocus as setUiFocus,
  setPendingPlacement as setUiPendingPlacement,
} from '../ui-state'
import {
  selectFrames,
  selectNone,
  selectPageById,
} from './selection-controller'
import { cancelActive as cancelActiveInteraction } from './interaction-controller'
import { layoutAllViews } from './layout-engine'
import { setPan, setZoom } from './viewport-control'
import { textEntities } from './text-entity-state'
import { fileEntities } from './file-entity-state'
import { drawingEntities } from './drawing-entity-state'
import { workspaceGroups } from './workspace-model'

type ArrowDirection = 'left' | 'right' | 'up' | 'down'

export function selectPage(index: number): void {
  void selectPageByIndex(index)
}

export function selectPageByIndex(index: number): boolean {
  if (index < 0 || index >= pages.length) return false
  return selectPageById(pages[index].id)
}

export function setSelectedFrames(frameIds: string[]): void {
  void selectFrames(frameIds)
}

export function deselectAll(): void {
  void selectNone()
}

function lookupEntityKind(entityId: string): CanvasEntityKind | null {
  if (pages.some((page) => page.id === entityId)) return 'frame'
  if (textEntities.some((entity) => entity.id === entityId)) return 'text'
  if (fileEntities.some((entity) => entity.id === entityId)) return 'file'
  if (drawingEntities.some((entity) => entity.id === entityId)) return 'drawing'
  if (workspaceGroups.some((group) => group.id === entityId)) return 'group'
  return null
}

/**
 * Enter or switch focus to an entity. Stashes the prior camera on first entry
 * so exitFocus() can restore it. Edges cannot be focused.
 */
export function setFocus(entityId: string, entityKind?: CanvasEntityKind): boolean {
  const resolvedKind = entityKind ?? lookupEntityKind(entityId)
  if (!resolvedKind || resolvedKind === 'edge') return false

  // Clear transient state — nothing leaks across focus transitions
  cancelActiveInteraction('external')
  setHoverTarget(null)
  if (uiPendingPlacement()) {
    setUiPendingPlacement(null)
  }

  const existing = uiFocusedEntity()
  // First entry stashes camera; subsequent switches keep the original stash
  const priorCamera = existing?.priorCamera ?? {
    zoom,
    pan: { x: pan.x, y: pan.y },
  }

  // Frame focus selects the page so navigation/keyboard work transparently
  if (resolvedKind === 'frame') {
    const page = pages.find((p) => p.id === entityId)
    if (!page) return false
    const selectedFrameIds = uiSelectedEntityIds()
    if (selectedFrameIds.length !== 1 || selectedFrameIds[0] !== entityId) {
      selectPageById(entityId)
    }
  }

  setUiFocus({ entityId, entityKind: resolvedKind, priorCamera })
  layoutAllViews()
  return true
}

/**
 * Exit focus and restore the camera stashed at entry.
 */
export function clearFocus(): boolean {
  const existing = uiFocusedEntity()
  if (!existing) return false

  cancelActiveInteraction('external')
  setHoverTarget(null)

  // Restore stashed camera before clearing focus
  setZoom(existing.priorCamera.zoom)
  setPan(existing.priorCamera.pan.x, existing.priorCamera.pan.y)
  setUiClearFocus()

  // browser-devtools panel tab no longer valid outside focus
  if (uiDevtoolsPanelTab() === 'browser-devtools') {
    setUiDevtoolsPanelTab('comments')
  }

  layoutAllViews()
  return true
}

/**
 * Focus the selected entity, or no-op if selection is empty/multi/edge.
 */
export function focusSelectedEntity(): boolean {
  const selectedIds = uiSelectedEntityIds()
  if (selectedIds.length !== 1) return false
  return setFocus(selectedIds[0])
}

export function selectAdjacentPage(direction: ArrowDirection): boolean {
  if (!pages.length) return false
  const frameOrder = workspaceTabs
    .find((tab) => tab.id === activeWorkspaceTabId)
    ?.snapshot.pages.map((page) => page.id)
    .filter((id): id is string => Boolean(id))
  if (!frameOrder?.length) return false
  const selectedIdx = uiSelectedPageIndex(pages.map((p) => p.id))
  const currentSelectedPageId =
    selectedIdx !== null && selectedIdx >= 0 && selectedIdx < pages.length
      ? pages[selectedIdx].id
      : null
  const currentFrameId =
    currentSelectedPageId ?? uiSelectedEntityIds()[0] ?? frameOrder[0]
  const currentOrderIndex = frameOrder.indexOf(currentFrameId)
  const baseOrderIndex = currentOrderIndex >= 0 ? currentOrderIndex : 0
  const step = direction === 'left' || direction === 'up' ? -1 : 1
  const nextOrderIndex = (baseOrderIndex + step + frameOrder.length) % frameOrder.length
  const nextFrameId = frameOrder[nextOrderIndex]
  return selectPageById(nextFrameId)
}
