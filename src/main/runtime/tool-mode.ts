/**
 * Tool mode management — annotation, inspect, placement, and devtools panel tab.
 */

import type { AnnotationMode, DevtoolsPanelTab } from '../../shared/types'
import { DRAWING_FEATURE_ENABLED } from '../../shared/featureFlags'
import { pages } from './runtime-context'
import { markDirty } from './layout-dirty'
import {
  annotationMode as uiAnnotationMode,
  devtoolsPanelTab as uiDevtoolsPanelTab,
  inspectEnabled as uiInspectEnabled,
  pendingPlacement as uiPendingPlacement,
  selectedPageIndex as uiSelectedPageIndex,
  clearToolMode as clearUiToolMode,
  setAnnotationMode as setUiAnnotationMode,
  setCanvasMode as setUiCanvasMode,
  setDevtoolsPanelTab as setUiDevtoolsPanelTab,
  setInspectEnabled as setUiInspectEnabled,
  setPendingPlacement as setUiPendingPlacement,
} from '../ui-state'
import {
  setInspectMode,
  setHoveredInspectTarget,
  syncInspectionState,
  notifyAnnotateStateChanged,
  notifyInspectStateChanged,
  notifyDevtoolsPanelData,
} from './inspect-session'
import { requestLayout } from './surface-layout'

function syncAnnotationState(): void {
  for (const page of pages) {
    page.pageView.webContents.send('set-annotate-mode', {
      enabled: uiAnnotationMode() === 'comment',
      mode: uiAnnotationMode(),
    })
  }
}

function setAnnotationMode(nextMode: AnnotationMode): AnnotationMode {
  const resolvedMode = pages.length > 0 ? nextMode : 'off'
  if (uiAnnotationMode() === resolvedMode) {
    syncAnnotationState()
    notifyAnnotateStateChanged()
    requestLayout()
    return uiAnnotationMode()
  }
  setUiAnnotationMode(resolvedMode, { hasPages: pages.length > 0 })
  if (resolvedMode !== 'off' && uiInspectEnabled()) {
    setUiInspectEnabled(false, { hasPages: pages.length > 0 })
  }
  markDirty('canvas')
  syncAnnotationState()
  syncInspectionState()
  notifyAnnotateStateChanged()
  notifyInspectStateChanged()
  requestLayout()
  return uiAnnotationMode()
}

export function toggleInspectMode(): boolean {
  const next = !uiInspectEnabled()
  setInspectMode(next)
  return next
}

export function clearToolMode(): void {
  const hadAnnotationMode = uiAnnotationMode() !== 'off'
  const hadInspectEnabled = uiInspectEnabled()
  clearUiToolMode()
  setHoveredInspectTarget(null)
  if (hadAnnotationMode) {
    markDirty('canvas')
    syncAnnotationState()
  }
  syncInspectionState()
  notifyAnnotateStateChanged()
  notifyInspectStateChanged()
  if (hadAnnotationMode || hadInspectEnabled) {
    notifyDevtoolsPanelData()
  }
  cancelPendingPlacement()
  requestLayout()
}

export function startPendingPlacement(input: {
  entityKind?: import('../../shared/types').CanvasEntityKind
  presetIndex?: number
  customSize?: boolean
  sourceFrameId?: string
  shapeKind?: import('../../shared/types').ShapeKind
}): void {
  setUiPendingPlacement({
    entityKind: input.entityKind ?? 'frame',
    presetIndex: input.presetIndex,
    customSize: input.customSize ?? false,
    sourceFrameId: input.sourceFrameId,
    shapeKind: input.shapeKind,
  })
  setUiCanvasMode()
  setUiInspectEnabled(false, { hasPages: pages.length > 0 })
  setUiAnnotationMode('off', { hasPages: pages.length > 0 })
  requestLayout()
}

export function cancelPendingPlacement(): void {
  if (!uiPendingPlacement()) return
  setUiPendingPlacement(null)
  requestLayout()
}

export function pendingPlacement() {
  return uiPendingPlacement()
}

export function toggleAnnotateMode(): boolean {
  const nextMode = uiAnnotationMode() === 'comment' ? 'off' : 'comment'
  return setAnnotationMode(nextMode) === 'comment'
}

export function toggleDrawMode(): boolean {
  if (!DRAWING_FEATURE_ENABLED) {
    if (uiAnnotationMode() === 'draw') {
      setAnnotationMode('off')
    }
    return false
  }
  const nextMode = uiAnnotationMode() === 'draw' ? 'off' : 'draw'
  return setAnnotationMode(nextMode) === 'draw'
}

export function toggleRegionSelectMode(): boolean {
  const nextMode = uiAnnotationMode() === 'region_select' ? 'off' : 'region_select'
  return setAnnotationMode(nextMode) === 'region_select'
}

export function isAnnotateMode(): boolean {
  return uiAnnotationMode() === 'comment'
}

export function setDevtoolsPanelTab(tab: DevtoolsPanelTab): { needsDevtoolsAttach: boolean; attachPageIndex: number | null } {
  if (uiDevtoolsPanelTab() === tab) return { needsDevtoolsAttach: false, attachPageIndex: null }
  setUiDevtoolsPanelTab(tab)
  if (tab !== 'inspect') {
    setHoveredInspectTarget(null)
  }
  let attachPageIndex: number | null = null
  if (tab === 'browser-devtools') {
    const selectedPageIdx = uiSelectedPageIndex(pages.map((p) => p.id))
    if (selectedPageIdx !== null) {
      attachPageIndex = selectedPageIdx
    }
  }
  syncInspectionState()
  notifyDevtoolsPanelData()
  return { needsDevtoolsAttach: attachPageIndex !== null, attachPageIndex }
}

// Re-export setAnnotationMode for wiring
export { setAnnotationMode }
