/**
 * Inspect session — component inspection, node detail, panel state building.
 */

import type {
  ComponentNodeDetail,
  ComponentTreeNode,
  DevtoolsPanelData,
  DevtoolsPanelDomTarget,
  DevtoolsPanelSelectionSummary,
  InspectMode,
  InspectNodeDetail,
  InspectNodeSummary,
  InspectPanelState,
  PanelEdgeEntityDetail,
  PanelDrawingEntityDetail,
  PanelFileEntityDetail,
  PanelFileType,
  PanelGroupEntityDetail,
  PanelMode,
  PanelMultiEntitySummary,
  PanelShapeEntityDetail,
  PanelTextEntityDetail,
  SourceLocation,
} from '../../shared/types'
import { frameDisplayLabel, viewportPresetForIndex } from './runtime-serialization'
import { requestNodeDetail, takePendingDetailRequest } from './frame-ipc'
import { safeSend } from './safe-send'
import type { Page } from './runtime-entities'
import {
  deviceIdFromMetadata,
  deviceOrientationFromMetadata,
  showDeviceFrameFromMetadata,
  useSvgDeviceShellFromMetadata,
} from './runtime-entities'
import {
  devtoolsHeaderView,
  toolbarView,
} from './view-refs'
import { getFixConfig } from './preferences'
import { getOriginBindingsView as getOriginBindings } from './dev-server-manager'
import { getInFlightCountByOrigin } from '../agent-fix/fix-tracker'
import { getFixProgress } from '../agent-fix/fix-progress'
import {
  findPageById,
  inspectActiveFrameId,
  inspectHoveredTarget,
  inspectSelectedNodeIdByFrame,
  inspectSelectedTarget,
  pages,
  selectedPage,
  selectedPageId,
  setInspectActiveFrameId,
  setInspectHoveredTarget as setInspectHoveredTargetState,
  setInspectSelectedTarget as setInspectSelectedTargetState,
} from './runtime-context'
import {
  workspaceAnnotations,
  workspaceEdges,
  workspaceGroups,
} from './workspace-model'
import { textEntities } from './text-entity-state'
import { fileEntities } from './file-entity-state'
import { drawingEntities } from './drawing-entity-state'
import { shapeEntities } from './shape-entity-state'
import { getRendererTagFor } from '../plugins/registry'
import {
  annotationMode as uiAnnotationMode,
  devtoolsPanelTab as uiDevtoolsPanelTab,
  focusedAnnotationId as uiFocusedAnnotationId,
  getUiState,
  inspectEnabled as uiInspectEnabled,
  selectedEntityIds as uiSelectedEntityIds,
  setInspectEnabled as setUiInspectEnabled,
} from '../ui-state'
import { devtoolsPanelDebug } from './runtime-constants'

// --- Core functions (already migrated to direct imports) ---

export function clearInspectTargets(): void {
  setInspectHoveredTargetState(null)
  setInspectSelectedTargetState(null)
  setInspectActiveFrameId(null)
}

export function restorePersistedInspectSelection(frameId: string): void {
  const nodeId = inspectSelectedNodeIdByFrame.get(frameId)
  if (!nodeId) return
  setSelectedInspectNodeById(frameId, nodeId)
}

export function currentInspectMode(): InspectMode {
  return uiSelectedEntityIds().length === 1 ? 'frame_locked' : 'global_target'
}

function effectiveInspectionPageIds(): Set<string> {
  if (!uiInspectEnabled()) return new Set()
  const mode = currentInspectMode()
  if (mode === 'global_target') {
    return new Set(pages.map((page) => page.id))
  }
  const activeId = selectedPageId() ?? inspectActiveFrameId
  return activeId ? new Set([activeId]) : new Set()
}

export function syncInspectionState(): void {
  const enabledPageIds = effectiveInspectionPageIds()
  for (const page of pages) {
    safeSend(page.pageView.webContents, 'set-inspection-mode', {
      enabled: enabledPageIds.has(page.id),
    })
  }
}

export function notifyInspectStateChanged(): void {
  if (!toolbarView || toolbarView.webContents.isDestroyed()) return
  toolbarView.webContents.send('inspect-state-changed', {
    enabled: uiInspectEnabled(),
    available: pages.length > 0,
  })
}

export function notifyAnnotateStateChanged(): void {
  if (!toolbarView || toolbarView.webContents.isDestroyed()) return
  toolbarView.webContents.send('annotate-state-changed', {
    enabled: uiAnnotationMode() !== 'off',
    available: pages.length > 0,
    mode: uiAnnotationMode(),
  })
}

// --- Helpers ---

function normalizedInspectDetail(
  frameId: string,
  target: DevtoolsPanelDomTarget | null | undefined,
): InspectNodeDetail | null {
  if (!target) return null
  const nodeId = (target as { nodeId?: string }).nodeId || target.id
  const sourceLocation =
    (target as { sourceLocation?: SourceLocation }).sourceLocation ??
    getComponentSourceLocationByNodeId(frameId, nodeId)
  return {
    ...target,
    frameId,
    nodeId,
    sourceLocation,
    id: nodeId,
  }
}

function getActiveInspectFrameId(): string | null {
  if (inspectSelectedTarget?.frameId) return inspectSelectedTarget.frameId
  // Prefer the explicitly selected page over a stale hover target
  const selected = selectedPageId()
  if (selected) return selected
  if (inspectHoveredTarget?.frameId) return inspectHoveredTarget.frameId
  if (inspectActiveFrameId) return inspectActiveFrameId
  return uiSelectedEntityIds()[0] ?? null
}

function componentNodeSource(id: string): InspectNodeSummary['source'] {
  if (id === 'meta:dom-root' || id.startsWith('dom:')) return 'dom_fallback'
  return 'react'
}

function flattenTree(
  frameId: string,
  tree: ComponentTreeNode[],
  parentId: string | undefined,
  roots: string[],
  nodesById: Record<string, InspectNodeSummary>,
): void {
  for (const node of tree) {
    if (!parentId) roots.push(node.id)
    nodesById[node.id] = {
      id: node.id,
      parentId,
      frameId,
      name: node.componentName,
      source: componentNodeSource(node.id),
      dsComponentName: node.dsComponentName,
      hasSource: node.hasSource,
      childrenIds: node.children.map((child) => child.id),
    }
    flattenTree(frameId, node.children, node.id, roots, nodesById)
  }
}

function buildInspectPanelState(): InspectPanelState {
  const frameId = getActiveInspectFrameId()
  const page = frameId ? findPageById(frameId) : undefined
  const roots: string[] = []
  const nodesById: Record<string, InspectNodeSummary> = {}
  if (page?.componentTree?.length) {
    flattenTree(frameId!, page.componentTree, undefined, roots, nodesById)
  }
  const detailById: Record<string, InspectNodeDetail> = {}
  if (page?.inspectDetailsByNodeId) {
    Object.assign(detailById, page.inspectDetailsByNodeId)
  }
  if (inspectHoveredTarget) detailById[inspectHoveredTarget.nodeId] = inspectHoveredTarget
  if (inspectSelectedTarget) detailById[inspectSelectedTarget.nodeId] = inspectSelectedTarget

  const nodeValues = Object.values(nodesById)
  const sourceLocationCount = nodeValues.filter((n) => n.hasSource).length
  const collector: NonNullable<InspectPanelState['diagnostics']>['collector'] =
    roots.some((id) => id.startsWith('r-2:root:mainworld:'))
      ? 'main_world'
      : roots.some((id) => id.startsWith('r-1:root:dom:'))
        ? 'dom_fiber'
        : roots.some((id) => id.startsWith('r'))
          ? 'hook'
          : roots.some((id) => id.startsWith('dom:'))
            ? 'dom_fallback'
            : 'unknown'

  return {
    available: pages.length > 0,
    enabled: uiInspectEnabled(),
    mode: currentInspectMode(),
    activeFrameId: frameId ?? null,
    hoveredNodeId: inspectHoveredTarget?.nodeId ?? null,
    selectedNodeId: inspectSelectedTarget?.nodeId ?? null,
    treeRootIds: roots,
    nodesById,
    detailById,
    diagnostics: {
      collector,
      nodeCount: nodeValues.length,
      reactNodeCount: nodeValues.filter((node) => node.source === 'react').length,
      domFallbackNodeCount: nodeValues.filter((node) => node.source === 'dom_fallback').length,
      sourceLocationCount,
    },
  }
}

function findComponentNodeById(
  tree: ComponentTreeNode[] | undefined,
  nodeId: string,
): ComponentTreeNode | null {
  if (!tree?.length) return null
  const stack = [...tree]
  while (stack.length) {
    const current = stack.pop()
    if (!current) continue
    if (current.id === nodeId) return current
    if (current.children.length) {
      for (let i = current.children.length - 1; i >= 0; i -= 1) {
        stack.push(current.children[i])
      }
    }
  }
  return null
}

function selectedPageSummary(): DevtoolsPanelSelectionSummary | undefined {
  const page = selectedPage()
  if (!page) return undefined
  const vp = viewportPresetForIndex(page.presetIndex)
  return {
    frameId: page.id,
    url: page.pageView.webContents.getURL() || 'about:blank',
    pageTitle: page.pageView.webContents.getTitle() || '',
    viewportLabel: vp.label,
    width: page.peekWidth ?? vp.width,
    height: page.peekHeight ?? vp.height,
    linked: page.linked,
  }
}

// --- Panel mode derivation ---

function derivePanelMode(): PanelMode {
  const { selection } = getUiState()
  if (selection.kind === 'none') return { kind: 'document' }
  if (selection.kind === 'single-entity') {
    return { kind: selection.entityKind, entityId: selection.entityId }
  }
  return { kind: 'multi', entityIds: selection.entityIds }
}

function buildTextEntityDetail(entityId: string): PanelTextEntityDetail | undefined {
  const entity = textEntities.find((e) => e.id === entityId)
  if (!entity) return undefined
  return { id: entity.id, text: entity.text, color: entity.color, width: entity.width, height: entity.height }
}

function detectFileType(filePath: string): PanelFileType {
  const tag = getRendererTagFor({
    kind: 'file',
    id: '__inspect__',
    file: filePath,
    canvasX: 0,
    canvasY: 0,
    width: 0,
    height: 0,
  })
  return tag ?? 'other'
}

function buildFileEntityDetail(entityId: string): PanelFileEntityDetail | undefined {
  const entity = fileEntities.find((e) => e.id === entityId)
  if (!entity) return undefined
  return {
    id: entity.id,
    file: entity.file,
    subpath: entity.subpath,
    width: entity.width,
    height: entity.height,
    objectFit: entity.objectFit,
    fileType: detectFileType(entity.file),
    presetIndex: entity.presetIndex,
    deviceId: deviceIdFromMetadata(entity.metadata) ?? null,
    deviceOrientation: deviceOrientationFromMetadata(entity.metadata),
    showDeviceFrame: showDeviceFrameFromMetadata(entity.metadata),
  }
}

function buildDrawingEntityDetail(entityId: string): PanelDrawingEntityDetail | undefined {
  const entity = drawingEntities.find((e) => e.id === entityId)
  if (!entity) return undefined
  return {
    id: entity.id,
    width: entity.width,
    height: entity.height,
    strokeCount: entity.strokes.length,
  }
}

function buildShapeEntityDetail(entityId: string): PanelShapeEntityDetail | undefined {
  const entity = shapeEntities.find((e) => e.id === entityId)
  if (!entity) return undefined
  return {
    id: entity.id,
    shapeKind: entity.shapeKind,
    text: entity.text,
    color: entity.color,
    strokeWidth: entity.strokeWidth,
    width: entity.width,
    height: entity.height,
  }
}

function buildEdgeEntityDetail(entityId: string): PanelEdgeEntityDetail | undefined {
  const edge = workspaceEdges.find((e) => e.id === entityId)
  if (!edge) return undefined
  return {
    id: edge.id,
    fromEntityId: edge.fromEntityId,
    toEntityId: edge.toEntityId,
    fromLabel: resolveEntityLabel(edge.fromEntityId),
    toLabel: resolveEntityLabel(edge.toEntityId),
    fromSide: edge.fromSide,
    toSide: edge.toSide,
    fromEnd: edge.fromEnd,
    toEnd: edge.toEnd,
    color: edge.color,
    label: edge.label,
    kind: edge.kind,
  }
}

function buildGroupEntityDetail(entityId: string): PanelGroupEntityDetail | undefined {
  const group = workspaceGroups.find((g) => g.id === entityId)
  if (!group) return undefined
  return {
    id: group.id,
    label: group.label,
    color: group.color,
    groupKind: group.groupKind,
    layoutMode: group.layoutMode,
    entityIds: group.entityIds ?? [],
  }
}

function resolveEntityLabel(entityId: string): string {
  const page = findPageById(entityId)
  if (page) return frameDisplayLabel(page)
  const text = textEntities.find((e) => e.id === entityId)
  if (text) return text.text.slice(0, 30) || 'Text'
  const file = fileEntities.find((e) => e.id === entityId)
  if (file) return file.file.split('/').pop() ?? 'File'
  const drawing = drawingEntities.find((e) => e.id === entityId)
  if (drawing) return `Drawing (${drawing.strokes.length} stroke${drawing.strokes.length === 1 ? '' : 's'})`
  const shape = shapeEntities.find((e) => e.id === entityId)
  if (shape) return shape.text.slice(0, 30) || shape.shapeKind
  const group = workspaceGroups.find((g) => g.id === entityId)
  if (group) return group.label || 'Group'
  return entityId.slice(0, 8)
}

function buildMultiEntitySummaries(entityIds: string[]): PanelMultiEntitySummary[] {
  const { selection } = getUiState()
  const kindsById = selection.kind === 'multi-entity' ? selection.entityKindsById : {}
  return entityIds.map((id) => ({
    id,
    kind: kindsById[id] ?? 'frame',
    label: resolveEntityLabel(id),
  }))
}

function buildEntityDetails(mode: PanelMode): Partial<Pick<DevtoolsPanelData, 'textEntity' | 'fileEntity' | 'drawingEntity' | 'shapeEntity' | 'edgeEntity' | 'groupEntity' | 'multiEntities'>> {
  switch (mode.kind) {
    case 'text': return { textEntity: buildTextEntityDetail(mode.entityId) }
    case 'file': return { fileEntity: buildFileEntityDetail(mode.entityId) }
    case 'drawing': return { drawingEntity: buildDrawingEntityDetail(mode.entityId) }
    case 'shape': return { shapeEntity: buildShapeEntityDetail(mode.entityId) }
    case 'edge': return { edgeEntity: buildEdgeEntityDetail(mode.entityId) }
    case 'group': return { groupEntity: buildGroupEntityDetail(mode.entityId) }
    case 'multi': return { multiEntities: buildMultiEntitySummaries(mode.entityIds) }
    default: return {}
  }
}

// --- Exported functions (migrated from DI to direct imports) ---

let _mcpEmptyState: () => DevtoolsPanelData['emptyState'] = () => undefined

export function wireMcpEmptyState(fn: () => DevtoolsPanelData['emptyState']): void {
  _mcpEmptyState = fn
}

export function notifyDevtoolsPanelData(): void {
  if (!devtoolsHeaderView) return
  const start = Date.now()
  const inspect = buildInspectPanelState()
  const panelMode = derivePanelMode()
  const frames = pages.map((page) => ({
    id: page.id,
    label: frameDisplayLabel(page),
    url: page.pageView.webContents.getURL(),
    faviconUrl: page.faviconUrl ?? null,
    width: viewportPresetForIndex(page.presetIndex)?.width,
    height: viewportPresetForIndex(page.presetIndex)?.height,
    presetIndex: page.presetIndex,
    deviceId: deviceIdFromMetadata(page.metadata),
    deviceOrientation: deviceOrientationFromMetadata(page.metadata),
    showDeviceFrame: showDeviceFrameFromMetadata(page.metadata),
    useSvgDeviceShell: useSvgDeviceShellFromMetadata(page.metadata),
    canGoBack: page.pageView.webContents.canGoBack(),
    canGoForward: page.pageView.webContents.canGoForward(),
    isLoading: page.pageView.webContents.isLoading(),
    linked: page.linked,
  }))
  devtoolsHeaderView.webContents.send('right-details-panel-data', {
    activeTab: uiDevtoolsPanelTab(),
    panelMode,
    annotateEnabled: uiAnnotationMode() === 'comment',
    annotateAvailable: pages.length > 0,
    focusedAnnotationId: uiFocusedAnnotationId(),
    selection: selectedPageSummary(),
    inspect,
    annotations: [...workspaceAnnotations],
    frames,
    originBindings: getOriginBindings(),
    fixInProgress: getInFlightCountByOrigin(),
    fixProgress: getFixProgress(),
    fixConfig: getFixConfig(),
    ...buildEntityDetails(panelMode),
    emptyState: _mcpEmptyState(),
  })
  devtoolsPanelDebug('panel-data:sent', {
    durationMs: Date.now() - start,
    panelMode: panelMode.kind,
    activeTab: uiDevtoolsPanelTab(),
    frameCount: frames.length,
    inspectNodeCount: inspect.diagnostics?.nodeCount ?? 0,
    selectedFrameId: selectedPageSummary()?.frameId ?? null,
  })
}

export function setInspectMode(enabled: boolean): void {
  const nextEnabled = pages.length > 0 ? enabled : false
  if (uiInspectEnabled() === nextEnabled) {
    syncInspectionState()
    notifyDevtoolsPanelData()
    notifyInspectStateChanged()
    return
  }
  setUiInspectEnabled(nextEnabled, { hasPages: pages.length > 0 })
  if (!nextEnabled) {
    setInspectHoveredTargetState(null)
  }
  syncInspectionState()
  notifyDevtoolsPanelData()
  notifyInspectStateChanged()
}

export function setHoveredInspectTarget(target: DevtoolsPanelDomTarget | null): void {
  if (!target) {
    setInspectHoveredTargetState(null)
    notifyDevtoolsPanelData()
    return
  }
  const normalized = normalizedInspectDetail(target.frameId, target)
  if (!normalized) return
  const page = findPageById(target.frameId)
  // Bail if the frame is gone or its backing webContents has been closed —
  // a late hover event on a destroyed page can wedge stale state that the
  // next GC sweep then crashes on.
  if (!page || page.pageView.webContents.isDestroyed()) return
  page.inspectDetailsByNodeId ??= {}
  page.inspectDetailsByNodeId[normalized.nodeId] = normalized
  setInspectActiveFrameId(target.frameId)
  setInspectHoveredTargetState(normalized)
  notifyDevtoolsPanelData()
}

export function setSelectedInspectTarget(target: DevtoolsPanelDomTarget | null): void {
  if (!target) {
    if (inspectSelectedTarget?.frameId) {
      inspectSelectedNodeIdByFrame.delete(inspectSelectedTarget.frameId)
    }
    setInspectSelectedTargetState(null)
    notifyDevtoolsPanelData()
    return
  }
  const normalized = normalizedInspectDetail(target.frameId, target)
  if (!normalized) return
  const page = findPageById(target.frameId)
  if (page) {
    page.inspectDetailsByNodeId ??= {}
    page.inspectDetailsByNodeId[normalized.nodeId] = normalized
  }
  setInspectActiveFrameId(target.frameId)
  setInspectSelectedTargetState(normalized)
  inspectSelectedNodeIdByFrame.set(target.frameId, normalized.nodeId)
  notifyDevtoolsPanelData()
  requestNodeDetail(target.frameId, normalized.nodeId)
}

export function setInspectNodeFromPanel(
  frameId: string,
  nodeId: string | null,
  pin: boolean,
): void {
  const page = findPageById(frameId)
  if (!page || page.pageView.webContents.isDestroyed()) return
  page.pageView.webContents.send('inspect-focus-node', {
    nodeId,
    pin,
    fromPanel: true,
  })
}

export function getComponentAncestryByNodeId(
  frameId: string,
  nodeId: string,
): string[] {
  const page = findPageById(frameId)
  if (!page?.componentTree?.length) return []

  const stack: Array<{ node: ComponentTreeNode; chain: string[] }> = []
  for (let i = page.componentTree.length - 1; i >= 0; i -= 1) {
    const root = page.componentTree[i]
    stack.push({ node: root, chain: [root.componentName] })
  }

  while (stack.length) {
    const current = stack.pop()
    if (!current) continue
    if (current.node.id === nodeId) {
      return current.chain
    }
    if (!current.node.children.length) continue
    for (let i = current.node.children.length - 1; i >= 0; i -= 1) {
      const child = current.node.children[i]
      stack.push({
        node: child,
        chain: [...current.chain, child.componentName],
      })
    }
  }

  return []
}

export function getComponentSourceLocationByNodeId(
  frameId: string,
  nodeId: string,
): SourceLocation | undefined {
  return findPageById(frameId)?.inspectDetailsByNodeId?.[nodeId]?.sourceLocation
}

export function setSelectedInspectNodeById(
  frameId: string,
  nodeId: string | null,
): void {
  if (!nodeId) {
    setInspectSelectedTargetState(null)
    return
  }
  const page = findPageById(frameId)
  if (!page) return
  const existing = page.inspectDetailsByNodeId?.[nodeId]
  if (existing) {
    setInspectSelectedTargetState(existing)
    return
  }

  const node = findComponentNodeById(page.componentTree, nodeId)
  const fallback: InspectNodeDetail = {
    id: nodeId,
    nodeId,
    frameId,
    timestamp: Date.now(),
    tagName: node?.componentName ?? 'element',
    name: node?.componentName ?? nodeId,
    elementPath: nodeId,
    fullPath: nodeId,
    cssClasses: [],
    nearbyElements: [],
    accessibility: [],
    attributes: [],
    computedStyles: [],
  }
  setInspectSelectedTargetState(fallback)
  requestNodeDetail(frameId, nodeId)
}

export function handleNodeDetailResponse(payload: {
  requestId: string
  nodeId: string
  detail: ComponentNodeDetail | null
}): void {
  const request = takePendingDetailRequest(payload.requestId)
  if (!request || !payload.detail) return
  const page = findPageById(request.frameId)
  if (!page) return

  page.inspectDetailsByNodeId ??= {}
  const existing = page.inspectDetailsByNodeId[request.nodeId]
  const merged: InspectNodeDetail = {
    ...(existing ?? {
      id: request.nodeId,
      frameId: request.frameId,
      timestamp: Date.now(),
      tagName: 'element',
      name: request.nodeId,
      elementPath: '',
      fullPath: '',
      cssClasses: [],
      nearbyElements: [],
      accessibility: [],
      attributes: [],
      computedStyles: [],
    }),
    nodeId: request.nodeId,
    frameId: request.frameId,
    props: payload.detail.props,
    tokens: payload.detail.tokens,
    dsComponentName: payload.detail.dsComponentName,
    sourceLocation: payload.detail.sourceLocation,
    dsVariants: payload.detail.dsVariants,
    dsPropSignature: payload.detail.dsPropSignature,
  }
  page.inspectDetailsByNodeId[request.nodeId] = merged

  if (inspectSelectedTarget?.nodeId === request.nodeId) {
    setInspectSelectedTargetState(merged)
  }
  if (inspectHoveredTarget?.nodeId === request.nodeId) {
    setInspectHoveredTargetState(merged)
  }

  notifyDevtoolsPanelData()
}
