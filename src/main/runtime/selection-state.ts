import {
  pages,
  setHoverTarget,
} from './runtime-context'
import { activeWorkspaceTabId, workspaceTabs } from './workspace-model'
import {
  activeTool as uiActiveTool,
  devtoolsPanelTab as uiDevtoolsPanelTab,
  selectedEntityIds as uiSelectedEntityIds,
  selectedPageIndex as uiSelectedPageIndex,
  setActiveTool as setUiActiveTool,
  setBrowserMode as setUiBrowserMode,
  setCanvasMode as setUiCanvasMode,
  setDevtoolsPanelTab as setUiDevtoolsPanelTab,
  workspaceViewMode as uiWorkspaceViewMode,
} from '../ui-state'
import {
  selectPages,
  selectNone,
  selectPageById,
} from './selection-controller'
import { cancelActive as cancelActiveInteraction } from './interaction-controller'
import { requestLayout } from './viewport-control'

type ArrowDirection = 'left' | 'right' | 'up' | 'down'

export function selectPage(index: number): void {
  void selectPageByIndex(index)
}

export function selectPageByIndex(index: number): boolean {
  if (index < 0 || index >= pages.length) return false
  return selectPageById(pages[index].id)
}

export function setSelectedPages(pageIds: string[]): void {
  void selectPages(pageIds)
}

export function deselectAll(): void {
  void selectNone()
}

/**
 * Single gate for all view-mode transitions. Clears transient state
 * (interaction, hover, pending placement) so nothing leaks across modes.
 */
function transitionViewMode(target: 'canvas' | 'browser', pageId?: string): boolean {
  // 1. Clear transient interaction state
  cancelActiveInteraction('external')
  setHoverTarget(null)
  if (uiActiveTool().kind !== 'select') {
    setUiActiveTool({ kind: 'select' })
  }

  // 2. Perform the mode-specific transition
  if (target === 'browser') {
    const selectedPageIds = uiSelectedEntityIds()
    const selectedIdx = uiSelectedPageIndex(pages.map((p) => p.id))
    const currentSelectedPageId =
      selectedIdx !== null && selectedIdx >= 0 && selectedIdx < pages.length
        ? pages[selectedIdx].id
        : null
    const targetId =
      pageId ?? currentSelectedPageId ?? selectedPageIds[0] ?? pages[0]?.id ?? null
    if (!targetId) return false
    const page = pages.find((p) => p.id === targetId)
    if (!page) return false
    if (currentSelectedPageId !== targetId || selectedPageIds.length !== 1 || selectedPageIds[0] !== targetId) {
      selectPageById(targetId)
    }
    setUiBrowserMode({ pageId: targetId })
  } else {
    if (uiWorkspaceViewMode() === 'canvas') return false
    setUiCanvasMode()
  }

  // 3. Validate devtools panel tab — browser-devtools only valid in browser mode
  if (target === 'canvas' && uiDevtoolsPanelTab() === 'browser-devtools') {
    setUiDevtoolsPanelTab('comments')
  }

  // 4. One layout pass at the end
  requestLayout()
  return true
}

export function setBrowserMode(pageId?: string): boolean {
  return transitionViewMode('browser', pageId)
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
  const pageOrder = workspaceTabs
    .find((tab) => tab.id === activeWorkspaceTabId)
    ?.snapshot.pages.map((page) => page.id)
    .filter((id): id is string => Boolean(id))
  if (!pageOrder?.length) return false
  const selectedIdx = uiSelectedPageIndex(pages.map((p) => p.id))
  const currentSelectedPageId =
    selectedIdx !== null && selectedIdx >= 0 && selectedIdx < pages.length
      ? pages[selectedIdx].id
      : null
  const currentPageId =
    currentSelectedPageId ?? uiSelectedEntityIds()[0] ?? pageOrder[0]
  const currentOrderIndex = pageOrder.indexOf(currentPageId)
  const baseOrderIndex = currentOrderIndex >= 0 ? currentOrderIndex : 0
  const step = direction === 'left' || direction === 'up' ? -1 : 1
  const nextOrderIndex = (baseOrderIndex + step + pageOrder.length) % pageOrder.length
  const nextPageId = pageOrder[nextOrderIndex]
  return selectPageById(nextPageId)
}
