/**
 * Tool mode management — single `activeTool` source of truth (ADR 0005).
 *
 * Replaces the three parallel state machines (`pendingPlacement`,
 * `AnnotationMode`, `inspect` boolean) with a single `Tool` discriminated
 * union. One-shot tools auto-revert to `select` after a placement; persistent
 * tools stay until replaced or dismissed.
 */

import type { DevtoolsPanelTab, Tool } from '../../shared/types'
import { isOneShot } from '../../shared/tool'
import { DRAWING_FEATURE_ENABLED } from '../../shared/featureFlags'
import { pages } from './runtime-context'
import { markDirty } from './layout-dirty'
import {
  activeTool as uiActiveTool,
  devtoolsPanelTab as uiDevtoolsPanelTab,
  selectedPageIndex as uiSelectedPageIndex,
  setActiveTool as setUiActiveTool,
  setDevtoolsPanelTab as setUiDevtoolsPanelTab,
} from '../ui-state'
import {
  setHoveredInspectTarget,
  syncInspectionState,
  notifyDevtoolsPanelData,
} from './inspect-session'
import { requestLayout } from './surface-layout'

function syncAnnotationState(): void {
  const tool = uiActiveTool()
  const mode =
    tool.kind === 'comment'
      ? 'comment'
      : tool.kind === 'draw'
        ? 'draw'
        : tool.kind === 'region-select'
          ? 'region_select'
          : 'off'
  for (const page of pages) {
    page.pageView.webContents.send('set-annotate-mode', {
      enabled: tool.kind === 'comment',
      mode,
    })
  }
}

function applyToolSideEffects(prev: Tool, next: Tool): void {
  const wasAnnotation = isAnnotationKind(prev.kind)
  const isAnnotation = isAnnotationKind(next.kind)
  const wasInspect = prev.kind === 'inspect'
  const isInspect = next.kind === 'inspect'

  // Inspect ↔ annotation transitions need to clear inspect hover state.
  if (wasInspect && !isInspect) {
    setHoveredInspectTarget(null)
  }

  if (wasAnnotation || isAnnotation) {
    markDirty('canvas')
    syncAnnotationState()
  }

  syncInspectionState()

  if (wasAnnotation !== isAnnotation || wasInspect !== isInspect) {
    notifyDevtoolsPanelData()
  }

  requestLayout()
}

function isAnnotationKind(kind: Tool['kind']): boolean {
  return kind === 'comment' || kind === 'draw' || kind === 'region-select'
}

function sanitizeForFeatureFlags(tool: Tool): Tool {
  if (tool.kind === 'draw' && !DRAWING_FEATURE_ENABLED) {
    return { kind: 'select' }
  }
  return tool
}

function sanitizeForPages(tool: Tool): Tool {
  if (pages.length > 0) return tool
  // Tools that operate on pages (annotations, inspect) require at least one
  // frame on the canvas. Without pages they collapse to select.
  if (isAnnotationKind(tool.kind) || tool.kind === 'inspect') {
    return { kind: 'select' }
  }
  return tool
}

/**
 * Set the active tool. Returns the resulting Tool (which may be sanitized for
 * feature flags or page availability).
 */
export function setActiveTool(tool: Tool): Tool {
  const sanitized = sanitizeForPages(sanitizeForFeatureFlags(tool))
  const prev = uiActiveTool()
  if (toolsEqual(prev, sanitized)) {
    // Idempotent: still re-sync downstream listeners so a renderer that
    // missed an event picks up the current state.
    applyToolSideEffects(prev, sanitized)
    return uiActiveTool()
  }
  setUiActiveTool(sanitized)
  applyToolSideEffects(prev, sanitized)
  return uiActiveTool()
}

function toolsEqual(a: Tool, b: Tool): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'add-text' && b.kind === 'add-text') return a.style === b.style
  if (a.kind === 'add-shape' && b.kind === 'add-shape') return a.shapeKind === b.shapeKind
  if (a.kind === 'add-page' && b.kind === 'add-page') {
    return (
      a.presetIndex === b.presetIndex &&
      a.customSize === b.customSize &&
      a.sourcePageId === b.sourcePageId
    )
  }
  return true
}

/** Reset to the default `select` tool. */
export function clearActiveTool(): Tool {
  return setActiveTool({ kind: 'select' })
}

/**
 * Called after a one-shot tool's placement completes. Reverts to `select`.
 * No-op for persistent tools.
 */
export function finishOneShotPlacement(): void {
  const tool = uiActiveTool()
  if (isOneShot(tool.kind)) {
    setActiveTool({ kind: 'select' })
  }
}

export function activeTool(): Tool {
  return uiActiveTool()
}

export function isAnnotateMode(): boolean {
  return uiActiveTool().kind === 'comment'
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
