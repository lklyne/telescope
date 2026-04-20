/**
 * Overlay and interaction management — canvas interaction mode, selection marquee.
 */

import type { SelectionOverlayPayload } from '../../shared/types'
import {
  aboveView,
  win,
} from './view-refs'
import { layoutCache } from './layout-cache'
import { setBoundsIfChanged } from './layout-engine'
import {
  automationInteractiveFrameCounts,
  pages,
  removeAutomationInteractiveFrameId,
  addAutomationInteractiveFrameId,
  setSelectionOverlayActive,
} from './runtime-context'
import { workspaceGroups } from './workspace-model'
import {
  focusedEntityId as uiFocusedEntityId,
  getUiState,
  isSelectionMarqueeVisible as uiSelectionMarqueeVisible,
  setSelectionMarqueeVisible as setUiSelectionMarqueeVisible,
} from '../ui-state'
import { selectionDebug } from './runtime-constants'
import { boundEffectivePageContentSize } from './runtime-geometry'
import { requestLayout } from './viewport-control'
import { safeSend } from './safe-send'

export function pageSelectionOverlayStates(): Array<{
  frameId: string
  interactive: boolean
  multiSelected: boolean
}> {
  const ui = getUiState()
  const multiSelectedFrameIds = new Set<string>()
  let interactiveFrameId: string | null = null

  if (ui.selection.kind === 'single-entity' && ui.selection.entityKind === 'frame') {
    interactiveFrameId = ui.selection.entityId
  } else if (ui.selection.kind === 'multi-entity') {
    for (const entityId of ui.selection.entityIds) {
      if (pages.some((page) => page.id === entityId)) {
        multiSelectedFrameIds.add(entityId)
      }
    }
  } else if (ui.selection.kind === 'single-entity' && ui.selection.entityKind === 'group') {
    const groupId = ui.selection.entityId
    for (const page of pages) {
      let currentParentId = page.parentGroupId
      while (currentParentId) {
        if (currentParentId === groupId) {
          multiSelectedFrameIds.add(page.id)
          break
        }
        currentParentId = workspaceGroups.find((candidate) => candidate.id === currentParentId)?.parentGroupId
      }
    }
  }

  return pages.map((page) => ({
    frameId: page.id,
    interactive: interactiveFrameId === page.id || automationInteractiveFrameCounts.has(page.id),
    multiSelected:
      interactiveFrameId !== page.id &&
      !automationInteractiveFrameCounts.has(page.id) &&
      multiSelectedFrameIds.has(page.id),
  }))
}

export function sendInteractiveState(): void {
  const states = pageSelectionOverlayStates()
  for (let i = 0; i < pages.length; i++) {
    const isSelected = states[i]?.interactive ?? false
    const isMultiSelected = states[i]?.multiSelected ?? false
    selectionDebug('sendInteractiveState', {
      pageId: pages[i].id,
      pageIndex: i,
      interactive: isSelected,
      multiSelected: isMultiSelected,
    })
    const wc = pages[i].pageView.webContents
    safeSend(wc, 'set-interactive', isSelected)
    safeSend(wc, 'set-multi-selected', isMultiSelected)
    safeSend(wc, 'set-focused-entity-id', uiFocusedEntityId())
  }
}

/** Off-screen position for automation views that aren't visible on the canvas. */
const AUTOMATION_OFFSCREEN_ORIGIN = -10_000

export function beginAutomationInteractiveFrame(frameId: string): void {
  addAutomationInteractiveFrameId(frameId)
  sendInteractiveState()

  const page = pages.find((p) => p.id === frameId)
  if (!page || page.pageView.webContents.isDestroyed()) return

  // Ensure the view has non-zero bounds so Chromium has a real viewport.
  // If the frame is off-screen (culled to 0×0 by layoutAllViews), park it
  // off-screen with proper dimensions. This lets agents work frames that
  // aren't visible on the canvas.
  const currentBounds = page.pageView.getBounds()
  if (currentBounds.width === 0 || currentBounds.height === 0) {
    const size = boundEffectivePageContentSize(page)
    page.pageView.setBounds({
      x: AUTOMATION_OFFSCREEN_ORIGIN,
      y: AUTOMATION_OFFSCREEN_ORIGIN,
      width: size.width,
      height: size.height,
    })
  }
}

export function endAutomationInteractiveFrame(frameId: string): void {
  if (!automationInteractiveFrameCounts.has(frameId)) return
  removeAutomationInteractiveFrameId(frameId)
  sendInteractiveState()
  // Invalidate bounds key so layoutAllViews restores viewport culling.
  const page = pages.find((p) => p.id === frameId)
  if (page) {
    page.lastPageBoundsKey = undefined
  }
}

export function setSelectionOverlayRect(
  overlay: SelectionOverlayPayload | null,
): void {
  setSelectionOverlayActive(overlay !== null)
  setUiSelectionMarqueeVisible(overlay !== null)

  if (!win || win.isDestroyed()) return

  if (aboveView) {
    safeSend(aboveView.webContents, 'canvas-selection-overlay', overlay)
  }
  // The gate predicate reads selectionMarqueeVisible, so a rect change
  // can flip aboveView bounds on/off. Bounds + visibility are centralized
  // in layoutAllViews — schedule it.
  requestLayout()
}
