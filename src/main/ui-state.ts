import type {
  AnnotationMode,
  CanvasEntityKind,
  CanvasSelectableTarget,
  DevtoolsPanelTab,
  SidebarFilter,
  UiFocus,
  UiPendingPlacement,
  UiSelection,
  UiState,
} from '../shared/types'
import { isAnnotationModeEnabled, isCanvasEntityKindEnabled } from '../shared/featureFlags'
import { markDirty } from './runtime/layout-dirty'
import { breadcrumb } from './sentry-context'

type SelectionInput =
  | { kind: 'none' }
  | { kind: 'single-entity'; entityId: string; entityKind: CanvasEntityKind }
  | {
      kind: 'multi-entity'
      entityIds: string[]
      entityKindsById: Partial<Record<string, CanvasEntityKind>>
    }

const DEFAULT_DEVTOOLS_WIDTH = 400

let uiState: UiState = createDefaultUiState()

function sanitizeSelectionInput(input: SelectionInput): SelectionInput {
  if (input.kind === 'single-entity') {
    return isCanvasEntityKindEnabled(input.entityKind) ? input : { kind: 'none' }
  }

  if (input.kind === 'multi-entity') {
    const entityIds = input.entityIds.filter((entityId) =>
      isCanvasEntityKindEnabled(input.entityKindsById[entityId] ?? 'frame'),
    )
    const entityKindsById = Object.fromEntries(
      entityIds.map((entityId) => [entityId, input.entityKindsById[entityId] ?? 'frame']),
    ) as Partial<Record<string, CanvasEntityKind>>
    return { kind: 'multi-entity', entityIds, entityKindsById }
  }

  return input
}

export function createDefaultUiState(): UiState {
  return {
    selection: { kind: 'none' },
    toolMode: 'select',
    focus: null,
    sidebarFilter: { kind: 'all' },
    leftSidebarOpen: true,
    devtools: {
      open: false,
      activeTab: 'comments',
      focusedAnnotationId: null,
      width: DEFAULT_DEVTOOLS_WIDTH,
    },
    overlays: {
      commentOverlayVisible: false,
      selectionMarqueeVisible: false,
    },
    pendingPlacement: null,
  }
}

export function resetUiState(next?: Partial<UiState>): UiState {
  uiState = {
    ...createDefaultUiState(),
    ...next,
  }
  return getUiState()
}

export function getUiState(): UiState {
  return cloneUiState(uiState)
}

export function replaceUiState(nextState: UiState): UiState {
  uiState = cloneUiState(nextState)
  if (!isAnnotationModeEnabled(annotationMode(uiState))) {
    clearToolMode()
  }
  setSelection(uiState.selection)
  return getUiState()
}

export function setSelection(input: SelectionInput): UiState {
  const nextInput = sanitizeSelectionInput(input)
  if (nextInput.kind === 'single-entity') {
    uiState.selection = { kind: 'single-entity', entityId: nextInput.entityId, entityKind: nextInput.entityKind }
    markDirty('canvas', 'sidebar', 'toolbar', 'floating-ui', 'devtools')
    return getUiState()
  }
  if (nextInput.kind === 'multi-entity') {
    const uniqueIds = [...new Set(nextInput.entityIds)]
    if (uniqueIds.length <= 1) {
      const entityId = uniqueIds[0]
      uiState.selection =
        entityId !== undefined
          ? {
              kind: 'single-entity',
              entityId,
              entityKind: nextInput.entityKindsById[entityId] ?? 'frame',
            }
          : { kind: 'none' }
    } else {
      uiState.selection = {
        kind: 'multi-entity',
        entityIds: uniqueIds,
        entityKindsById: { ...nextInput.entityKindsById },
      }
    }
    if (uiState.focus !== null) {
      uiState.focus = null
    }
    markDirty('canvas', 'sidebar', 'toolbar', 'floating-ui', 'devtools')
    return getUiState()
  }
  uiState.selection = { kind: 'none' }
  markDirty('canvas', 'sidebar', 'toolbar', 'floating-ui', 'devtools')
  return getUiState()
}

export function clearToolMode(): UiState {
  uiState.toolMode = 'select'
  markDirty('toolbar')
  return getUiState()
}

export function setInspectEnabled(enabled: boolean, options?: { hasPages?: boolean }): UiState {
  const hasPages = options?.hasPages ?? true
  uiState.toolMode = enabled && hasPages ? 'inspect' : 'select'
  return getUiState()
}

export function setAnnotationMode(
  mode: AnnotationMode,
  options?: { hasPages?: boolean },
): UiState {
  const hasPages = options?.hasPages ?? true
  const nextMode = isAnnotationModeEnabled(mode) ? mode : 'off'
  if (!hasPages || nextMode === 'off') {
    uiState.toolMode = 'select'
    markDirty('canvas', 'toolbar')
    return getUiState()
  }
  const toolModeMap = {
    comment: 'annotate-comment',
    draw: 'annotate-draw',
    region_select: 'annotate-region-select',
  } as const
  uiState.toolMode = toolModeMap[nextMode] ?? 'annotate-comment'
  markDirty('canvas', 'toolbar')
  return getUiState()
}

export function setFocus(focus: UiFocus): UiState {
  const prev = uiState.focus
  if (!prev) {
    breadcrumb('focus', `enter:${focus.entityKind}`)
  } else if (prev.entityId !== focus.entityId) {
    breadcrumb('focus', `switch:${focus.entityKind}`)
  }
  uiState.selection = { kind: 'single-entity', entityId: focus.entityId, entityKind: focus.entityKind }
  uiState.focus = focus
  markDirty('canvas', 'sidebar', 'toolbar', 'bounds', 'pages')
  return getUiState()
}

export function clearFocus(): UiState {
  if (uiState.focus === null) return getUiState()
  breadcrumb('focus', 'exit')
  uiState.focus = null
  markDirty('canvas', 'sidebar', 'toolbar', 'bounds', 'pages')
  return getUiState()
}

export function setSidebarFilter(filter: SidebarFilter): UiState {
  uiState.sidebarFilter = filter
  markDirty('sidebar')
  return getUiState()
}

export function updateSelectionForRemovedEntity(entityId: string): UiState {
  if (uiState.selection.kind === 'single-entity') {
    if (uiState.selection.entityId === entityId) {
      uiState.selection = { kind: 'none' }
    }
  } else if (uiState.selection.kind === 'multi-entity') {
    const { entityIds, entityKindsById } = uiState.selection
    const remaining = entityIds.filter((candidate) => candidate !== entityId)
    const remainingKindsById = Object.fromEntries(
      remaining.map((id) => [id, entityKindsById[id] ?? 'frame']),
    ) as Partial<Record<string, CanvasEntityKind>>
    uiState.selection =
      remaining.length > 1
        ? {
            kind: 'multi-entity',
            entityIds: remaining,
            entityKindsById: remainingKindsById,
          }
        : remaining[0]
          ? {
              kind: 'single-entity',
              entityId: remaining[0],
              entityKind: remainingKindsById[remaining[0]] ?? 'frame',
            }
          : { kind: 'none' }
  }

  if (uiState.focus?.entityId === entityId) {
    uiState.focus = null
  }
  return getUiState()
}

export function setDevtoolsOpen(open: boolean): UiState {
  uiState.devtools.open = open
  markDirty('bounds', 'devtools')
  return getUiState()
}

export function setLeftSidebarOpen(open: boolean): UiState {
  uiState.leftSidebarOpen = open
  markDirty('toolbar', 'bounds')
  return getUiState()
}

export function setDevtoolsPanelTab(tab: DevtoolsPanelTab): UiState {
  uiState.devtools.activeTab = tab
  if (tab !== 'comments') {
    uiState.devtools.focusedAnnotationId = null
  }
  return getUiState()
}

export function focusAnnotation(annotationId: string | null): UiState {
  uiState.devtools.focusedAnnotationId = annotationId
  return getUiState()
}

export function setCommentOverlayVisible(visible: boolean): UiState {
  uiState.overlays.commentOverlayVisible = visible
  return getUiState()
}

export function setSelectionMarqueeVisible(visible: boolean): UiState {
  uiState.overlays.selectionMarqueeVisible = visible
  return getUiState()
}

export function setPendingPlacement(
  pendingPlacement: UiPendingPlacement | null,
): UiState {
  uiState.pendingPlacement = pendingPlacement
  markDirty('canvas', 'toolbar')
  return getUiState()
}

export function setDevtoolsWidth(width: number): UiState {
  uiState.devtools.width = width
  markDirty('bounds', 'devtools')
  return getUiState()
}

export function focusedEntity(ui: UiState = uiState): UiFocus | null {
  return ui.focus
}

export function focusedEntityId(ui: UiState = uiState): string | null {
  return ui.focus?.entityId ?? null
}

/** True when any entity is focused (replaces the old browser-mode check). */
export function isFocused(ui: UiState = uiState): boolean {
  return ui.focus !== null
}

/** Frame id being focused, or null if focus is on a non-frame or none. */
export function focusedFrameId(ui: UiState = uiState): string | null {
  if (ui.focus?.entityKind === 'frame') return ui.focus.entityId
  return null
}

export function sidebarFilter(ui: UiState = uiState): SidebarFilter {
  return ui.sidebarFilter
}

export function selectedEntityIds(ui: UiState = uiState): string[] {
  if (ui.selection.kind === 'single-entity') {
    return isCanvasEntityKindEnabled(ui.selection.entityKind) ? [ui.selection.entityId] : []
  }
  if (ui.selection.kind === 'multi-entity') {
    const { entityIds, entityKindsById } = ui.selection
    return entityIds.filter((entityId) =>
      isCanvasEntityKindEnabled(entityKindsById[entityId] ?? 'frame'),
    )
  }
  return []
}

export function selectedCanvasTargets(ui: UiState = uiState): CanvasSelectableTarget[] {
  if (ui.selection.kind === 'single-entity') {
    return isCanvasEntityKindEnabled(ui.selection.entityKind)
      ? [{ id: ui.selection.entityId, kind: ui.selection.entityKind }]
      : []
  }
  if (ui.selection.kind === 'multi-entity') {
    const { entityIds, entityKindsById } = ui.selection
    return entityIds
      .filter((entityId) => isCanvasEntityKindEnabled(entityKindsById[entityId] ?? 'frame'))
      .map((entityId) => ({
        id: entityId,
        kind: entityKindsById[entityId] ?? 'frame',
      }))
  }
  return []
}

export function selectedEntityId(ui: UiState = uiState): string | null {
  if (ui.selection.kind === 'single-entity') return ui.selection.entityId
  if (ui.selection.kind === 'multi-entity') return ui.selection.entityIds[0] ?? null
  if (ui.focus) return ui.focus.entityId
  return null
}

export function selectedGroupId(ui: UiState = uiState): string | null {
  if (ui.selection.kind === 'single-entity' && ui.selection.entityKind === 'group') {
    return ui.selection.entityId
  }
  return null
}

export function inspectEnabled(ui: UiState = uiState): boolean {
  return ui.toolMode === 'inspect'
}

export function annotationMode(ui: UiState = uiState): AnnotationMode {
  if (ui.toolMode === 'annotate-comment') return 'comment'
  if (ui.toolMode === 'annotate-draw') return isAnnotationModeEnabled('draw') ? 'draw' : 'off'
  if (ui.toolMode === 'annotate-region-select') return 'region_select'
  return 'off'
}

export function isCommentOverlayVisible(ui: UiState = uiState): boolean {
  return ui.overlays.commentOverlayVisible
}

export function isSelectionMarqueeVisible(ui: UiState = uiState): boolean {
  return ui.overlays.selectionMarqueeVisible
}

export function pendingPlacement(ui: UiState = uiState): UiPendingPlacement | null {
  return ui.pendingPlacement
}

export function devtoolsOpen(ui: UiState = uiState): boolean {
  return ui.devtools.open
}

export function leftSidebarOpen(ui: UiState = uiState): boolean {
  return ui.leftSidebarOpen
}

export function devtoolsPanelTab(ui: UiState = uiState): DevtoolsPanelTab {
  return ui.devtools.activeTab
}

export function focusedAnnotationId(ui: UiState = uiState): string | null {
  return ui.devtools.focusedAnnotationId
}

export function devtoolsWidth(ui: UiState = uiState): number {
  return ui.devtools.width
}

export function selectedPageIndex(
  pageIds: string[],
  ui: UiState = uiState,
): number | null {
  const activeFrameId =
    ui.selection.kind === 'multi-entity'
      ? ui.selection.entityIds.find((entityId) => pageIds.includes(entityId)) ?? null
      : selectedEntityId(ui)
  if (!activeFrameId) return null
  const index = pageIds.indexOf(activeFrameId)
  return index >= 0 ? index : null
}

function cloneUiState(input: UiState): UiState {
  return {
    selection:
      input.selection.kind === 'multi-entity'
        ? {
            kind: 'multi-entity',
            entityIds: [...input.selection.entityIds],
            entityKindsById: { ...input.selection.entityKindsById },
          }
        : { ...input.selection },
    toolMode: input.toolMode,
    focus: input.focus
      ? {
          entityId: input.focus.entityId,
          entityKind: input.focus.entityKind,
          priorCamera: {
            zoom: input.focus.priorCamera.zoom,
            pan: { ...input.focus.priorCamera.pan },
          },
        }
      : null,
    sidebarFilter:
      input.sidebarFilter.kind === 'by-kind'
        ? { kind: 'by-kind', entityKind: input.sidebarFilter.entityKind }
        : { kind: 'all' },
    leftSidebarOpen: input.leftSidebarOpen,
    devtools: { ...input.devtools },
    overlays: { ...input.overlays },
    pendingPlacement: input.pendingPlacement
      ? { ...input.pendingPlacement }
      : null,
  }
}
