import {
  pages,
  setHoverTarget,
} from './runtime-context'
import { activeWorkspaceTabId, workspaceTabs } from './workspace-model'
import {
  devtoolsPanelTab as uiDevtoolsPanelTab,
  pendingPlacement as uiPendingPlacement,
  selectedEntityIds as uiSelectedEntityIds,
  selectedPageIndex as uiSelectedPageIndex,
  setBrowserMode as setUiBrowserMode,
  setCanvasMode as setUiCanvasMode,
  setDevtoolsPanelTab as setUiDevtoolsPanelTab,
  setPendingPlacement as setUiPendingPlacement,
  workspaceViewMode as uiWorkspaceViewMode,
} from '../ui-state'
import {
  selectFrames,
  selectNone,
  selectPageById,
} from './selection-controller'
import { cancelActive as cancelActiveInteraction } from './interaction-controller'
import { layoutAllViews } from './layout-engine'

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

/**
 * Single gate for all view-mode transitions. Clears transient state
 * (interaction, hover, pending placement) so nothing leaks across modes.
 */
function transitionViewMode(target: 'canvas' | 'browser', frameId?: string): boolean {
  // 1. Clear transient interaction state
  cancelActiveInteraction('external')
  setHoverTarget(null)
  if (uiPendingPlacement()) {
    setUiPendingPlacement(null)
  }

  // 2. Perform the mode-specific transition
  if (target === 'browser') {
    const selectedFrameIds = uiSelectedEntityIds()
    const selectedIdx = uiSelectedPageIndex(pages.map((p) => p.id))
    const currentSelectedPageId =
      selectedIdx !== null && selectedIdx >= 0 && selectedIdx < pages.length
        ? pages[selectedIdx].id
        : null
    const targetId =
      frameId ?? currentSelectedPageId ?? selectedFrameIds[0] ?? pages[0]?.id ?? null
    if (!targetId) return false
    const page = pages.find((p) => p.id === targetId)
    if (!page) return false
    if (currentSelectedPageId !== targetId || selectedFrameIds.length !== 1 || selectedFrameIds[0] !== targetId) {
      selectPageById(targetId)
    }
    setUiBrowserMode({ frameId: targetId })
  } else {
    if (uiWorkspaceViewMode() === 'canvas') return false
    setUiCanvasMode()
  }

  // 3. Validate devtools panel tab — browser-devtools only valid in browser mode
  if (target === 'canvas' && uiDevtoolsPanelTab() === 'browser-devtools') {
    setUiDevtoolsPanelTab('comments')
  }

  // 4. One layout pass at the end
  layoutAllViews()
  return true
}

export function setBrowserMode(frameId?: string): boolean {
  return transitionViewMode('browser', frameId)
}

export function setCanvasMode(): void {
  transitionViewMode('canvas')
}

export function toggleBrowserMode(): boolean {
  if (uiWorkspaceViewMode() === 'browser') {
    setCanvasMode()
    return false
  }
  return setBrowserMode()
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
