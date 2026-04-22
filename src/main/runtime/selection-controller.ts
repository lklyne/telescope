import type { CanvasEntityKind, UiState } from '../../shared/types'
import type { SelectionMutationMode } from '../../shared/selection-modifiers'
import {
  devtoolsPanelTab as uiDevtoolsPanelTab,
  getUiState,
  selectedEntityIds as uiSelectedEntityIds,
  selectedGroupId as uiSelectedGroupId,
  setCanvasMode as setUiCanvasMode,
  setDevtoolsPanelTab as setUiDevtoolsPanelTab,
  setSelection as setUiSelection,
  workspaceViewMode as uiWorkspaceViewMode,
} from '../ui-state'
import {
  findPageById,
  hoverTarget,
  pages,
  setHoverTarget,
} from './runtime-context'
import { workspaceEdges, workspaceGroups } from './workspace-model'
import { cancelActive as cancelActiveInteraction } from './interaction-controller'
import { clearInspectTargets, notifyDevtoolsPanelData, syncInspectionState } from './inspect-session'
import { layoutAllViews } from './layout-engine'
import { sendInteractiveState } from './overlay-manager'
import { savePreferences } from './preferences'
import { drawingEntities } from './drawing-entity-state'
import { fileEntities } from './file-entity-state'
import { textEntities } from './text-entity-state'
import { breadcrumb } from '../sentry-context'

type SelectionCommand =
  | { kind: 'none' }
  | { kind: 'single-entity'; entityId: string; entityKind: CanvasEntityKind }
  | {
      kind: 'multi-entity'
      entityIds: string[]
      entityKindsById: Partial<Record<string, CanvasEntityKind>>
    }

type CommitOptions = {
  clearHover?: boolean
  clearInteraction?: boolean
  clearInspect?: boolean
  notifyDevtools?: boolean
  syncInspection?: boolean
}

function selectionEquals(a: UiState['selection'], b: SelectionCommand): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'none' && b.kind === 'none') return true
  if (a.kind === 'single-entity' && b.kind === 'single-entity') {
    return a.entityId === b.entityId && a.entityKind === b.entityKind
  }
  if (a.kind === 'multi-entity' && b.kind === 'multi-entity') {
    if (a.entityIds.length !== b.entityIds.length) return false
    return a.entityIds.every((id, index) => {
      if (b.entityIds[index] !== id) return false
      return (a.entityKindsById[id] ?? 'frame') === (b.entityKindsById[id] ?? 'frame')
    })
  }
  return false
}

export function resolveEntityKind(entityId: string): CanvasEntityKind {
  if (findPageById(entityId)) return 'frame'
  if (textEntities.some((entity) => entity.id === entityId)) return 'text'
  if (fileEntities.some((entity) => entity.id === entityId)) return 'file'
  if (drawingEntities.some((entity) => entity.id === entityId)) return 'drawing'
  if (workspaceGroups.some((group) => group.id === entityId)) return 'group'
  if (workspaceEdges.some((edge) => edge.id === entityId)) return 'edge'
  return 'frame'
}

function browserSelectionAllowed(nextSelection: SelectionCommand): boolean {
  return nextSelection.kind === 'single-entity' && nextSelection.entityKind === 'frame'
}

function describeSelection(selection: SelectionCommand): Record<string, unknown> | undefined {
  if (selection.kind === 'single-entity') {
    return { kind: selection.entityKind }
  }
  if (selection.kind === 'multi-entity') {
    return { count: selection.entityIds.length }
  }
  return undefined
}

function normalizeEntitySelection(entityIds: string[]): SelectionCommand {
  const nextEntityIds = [...new Set(entityIds)].filter((entityId) => {
    if (findPageById(entityId)) return true
    if (textEntities.some((entity) => entity.id === entityId)) return true
    if (fileEntities.some((entity) => entity.id === entityId)) return true
    if (drawingEntities.some((entity) => entity.id === entityId)) return true
    return workspaceEdges.some((edge) => edge.id === entityId)
  })

  if (!nextEntityIds.length) return { kind: 'none' }
  if (nextEntityIds.length === 1) {
    const entityId = nextEntityIds[0]
    return { kind: 'single-entity', entityId, entityKind: resolveEntityKind(entityId) }
  }

  return {
    kind: 'multi-entity',
    entityIds: nextEntityIds,
    entityKindsById: Object.fromEntries(
      nextEntityIds.map((entityId) => [entityId, resolveEntityKind(entityId)]),
    ) as Partial<Record<string, CanvasEntityKind>>,
  }
}

function commitSelection(
  nextSelection: SelectionCommand,
  options?: CommitOptions,
): boolean {
  const currentUi = getUiState()
  const shouldClearHover = options?.clearHover ?? nextSelection.kind === 'none'
  const shouldClearInteraction = options?.clearInteraction ?? false
  const shouldClearInspect = options?.clearInspect ?? false
  const shouldSyncInspection = options?.syncInspection ?? true
  const shouldNotifyDevtools = options?.notifyDevtools ?? true

  if (uiWorkspaceViewMode(currentUi) === 'browser' && !browserSelectionAllowed(nextSelection)) {
    setUiCanvasMode()
  }

  if (selectionEquals(getUiState().selection, nextSelection)) {
    if (shouldClearHover && hoverTarget) {
      setHoverTarget(null)
    }
    if (shouldClearInteraction) cancelActiveInteraction('external')
    if (shouldClearInspect) clearInspectTargets()
    sendInteractiveState()
    if (shouldSyncInspection) syncInspectionState()
    if (shouldNotifyDevtools) notifyDevtoolsPanelData()
    layoutAllViews()
    return false
  }

  setUiSelection(nextSelection)
  breadcrumb('selection', nextSelection.kind, describeSelection(nextSelection))

  if (!browserSelectionAllowed(nextSelection) && uiDevtoolsPanelTab() === 'browser-devtools') {
    setUiDevtoolsPanelTab('comments')
    savePreferences()
  }

  if (shouldClearHover) {
    setHoverTarget(null)
  }
  if (shouldClearInteraction) cancelActiveInteraction('external')
  if (shouldClearInspect) clearInspectTargets()

  sendInteractiveState()
  if (shouldSyncInspection) syncInspectionState()
  if (shouldNotifyDevtools) notifyDevtoolsPanelData()
  layoutAllViews()
  return true
}

export function selectNone(options?: CommitOptions): boolean {
  return commitSelection({ kind: 'none' }, { clearHover: true, ...options })
}

export function selectPageById(
  pageId: string,
  options?: CommitOptions,
): boolean {
  const page = findPageById(pageId)
  if (!page) return false
  return commitSelection(
    { kind: 'single-entity', entityId: page.id, entityKind: 'frame' },
    options,
  )
}

export function selectPageByIndex(
  index: number,
  options?: CommitOptions,
): boolean {
  if (index < 0 || index >= pages.length) return false
  return selectPageById(pages[index].id, options)
}

export function selectEntity(
  entityId: string,
  entityKind: CanvasEntityKind,
  options?: CommitOptions,
): boolean {
  if (entityKind === 'frame') {
    return selectPageById(entityId, options)
  }
  return commitSelection(
    { kind: 'single-entity', entityId, entityKind },
    { clearInteraction: true, ...options },
  )
}

export function selectEntities(
  entityIds: string[],
  options?: CommitOptions,
): boolean {
  const nextSelection = normalizeEntitySelection(entityIds)
  if (nextSelection.kind === 'none') return selectNone(options)
  if (nextSelection.kind === 'single-entity') {
    return selectEntity(nextSelection.entityId, nextSelection.entityKind, options)
  }
  return commitSelection(nextSelection, { clearInspect: true, ...options })
}

export function selectFrames(
  frameIds: string[],
  options?: CommitOptions,
): boolean {
  const nextFrameIds = [...new Set(frameIds)].filter((frameId) => Boolean(findPageById(frameId)))
  if (!nextFrameIds.length) return selectNone(options)
  if (nextFrameIds.length === 1) return selectPageById(nextFrameIds[0], options)
  return commitSelection(
    {
      kind: 'multi-entity',
      entityIds: nextFrameIds,
      entityKindsById: Object.fromEntries(nextFrameIds.map((id) => [id, 'frame' as const])),
    },
    { clearInspect: true, ...options },
  )
}

export function selectGroup(
  groupId: string,
  options?: CommitOptions,
): boolean {
  const group = workspaceGroups.find((candidate) => candidate.id === groupId)
  if (!group) return false
  return commitSelection(
    { kind: 'single-entity', entityId: groupId, entityKind: 'group' },
    { clearInteraction: true, ...options },
  )
}

export function enterGroup(
  groupId: string,
  options?: CommitOptions,
): boolean {
  const childIds = [
    ...pages.filter((page) => page.parentGroupId === groupId).map((page) => page.id),
    ...textEntities.filter((entity) => entity.parentGroupId === groupId).map((entity) => entity.id),
    ...fileEntities.filter((entity) => entity.parentGroupId === groupId).map((entity) => entity.id),
    ...workspaceGroups.filter((group) => group.parentGroupId === groupId).map((group) => group.id),
  ]
  if (!childIds.length) return false
  return selectEntities(childIds, { clearInteraction: true, ...options })
}

export function applyEntitySelectionMutation(
  targetIds: string[],
  mode: SelectionMutationMode,
  options?: CommitOptions,
): boolean {
  if (mode === 'replace') return selectEntities(targetIds, options)

  const current = uiSelectedEntityIds()
  const currentSet = new Set(current)
  const targetSet = new Set(targetIds)

  let nextIds: string[]
  if (mode === 'add') {
    nextIds = [...new Set([...current, ...targetIds])]
  } else if (mode === 'remove') {
    nextIds = current.filter((id) => !targetSet.has(id))
  } else {
    // toggle: XOR — entities already selected are dropped, new ones are added
    const kept = current.filter((id) => !targetSet.has(id))
    const added = targetIds.filter((id) => !currentSet.has(id))
    nextIds = [...kept, ...added]
  }

  return selectEntities(nextIds, options)
}

export function selectedDragEntityIds(entityId: string): string[] {
  const selectedIds = uiSelectedEntityIds()
  if (selectedIds.length > 1 && selectedIds.includes(entityId)) {
    return selectedIds
  }
  const activeGroupId = uiSelectedGroupId()
  if (activeGroupId) {
    const descendantIds = [
      ...pages.filter((page) => page.parentGroupId === activeGroupId).map((page) => page.id),
      ...textEntities.filter((entity) => entity.parentGroupId === activeGroupId).map((entity) => entity.id),
      ...fileEntities.filter((entity) => entity.parentGroupId === activeGroupId).map((entity) => entity.id),
      ...workspaceGroups.filter((group) => group.parentGroupId === activeGroupId).map((group) => group.id),
    ]
    if (descendantIds.includes(entityId)) {
      return descendantIds
    }
  }
  return [entityId]
}
