/**
 * JSON Canvas Serializer/Deserializer
 *
 * Converts between our internal WorkspaceSnapshot format and the
 * JSON Canvas specification v1.0 (https://jsoncanvas.org/).
 */

import type {
  Annotation,
  BrowserTabMode,
  DevtoolsPanelTab,
  PersistedCanvasEntity,
  PersistedDrawingEntity,
  PersistedFileEntity,
  PersistedFrameEntity,
  PersistedGroupEntity,
  PersistedShapeEntity,
  PersistedTextEntity,
  WorkspaceEdge,
  WorkspaceGroup,
  WorkspaceSnapshot,
} from '../../shared/types'
import type {
  JsonCanvasDocument,
  JsonCanvasDrawingNode,
  JsonCanvasEdge,
  JsonCanvasFileNode,
  JsonCanvasGroupNode,
  JsonCanvasLinkNode,
  JsonCanvasNode,
  JsonCanvasShapeNode,
  JsonCanvasTextNode,
  JsonCanvasAppState,
} from '../../shared/json-canvas-types'
import { VIEWPORT_PRESETS } from '../../shared/constants'
import { resolveCanvasColor } from '../../shared/canvas-colors'
import { frameCustomSizeFromMetadata } from './runtime-entities'

// --- Serialize ---

export function serializeToJsonCanvas(
  snapshot: WorkspaceSnapshot,
  annotations?: Annotation[],
): JsonCanvasDocument {
  const nodes: JsonCanvasNode[] = []
  const edges: JsonCanvasEdge[] = []

  // Build ordered entity list
  const entityIds = snapshot.entityOrder ?? Object.keys(snapshot.entities ?? {})
  const entities = snapshot.entities ?? {}

  // Also include frame entities from legacy pages array
  for (const page of snapshot.pages) {
    if (page.id && !entities[page.id]) {
      const entity: PersistedFrameEntity = {
        kind: 'frame',
        id: page.id,
        name: page.name,
        url: page.url,
        presetIndex: page.presetIndex,
        canvasX: page.canvasX,
        canvasY: page.canvasY,
        linked: page.linked,
        source: page.source,
        parentGroupId: page.parentGroupId ?? page.groupId,
        groupId: page.parentGroupId ?? page.groupId,
        metadata: page.metadata,
      }
      entities[page.id] = entity
      if (!entityIds.includes(page.id)) entityIds.push(page.id)
    }
  }

  // Convert entities to nodes (array order = z-order per spec)
  for (const id of entityIds) {
    const entity = entities[id]
    if (!entity) continue

    if (entity.kind === 'frame') {
      nodes.push(serializeFrameToLinkNode(entity))
    } else if (entity.kind === 'text') {
      nodes.push(serializeTextToTextNode(entity))
    } else if (entity.kind === 'file') {
      nodes.push(serializeFileToFileNode(entity))
    } else if (entity.kind === 'group') {
      nodes.push(serializeGroupEntityToGroupNode(entity))
    } else if (entity.kind === 'drawing') {
      nodes.push(serializeDrawingToDrawingNode(entity))
    } else if (entity.kind === 'shape') {
      nodes.push(serializeShapeToShapeNode(entity))
    }
  }

  // Convert edges
  if (snapshot.edges) {
    for (const edge of snapshot.edges) {
      edges.push(serializeEdge(edge))
    }
  }

  const doc: JsonCanvasDocument = { nodes, edges }

  // Add annotations as extension
  if (annotations?.length) {
    doc.annotations = annotations
  }

  // Add app state as extension
  doc.appState = serializeAppState(snapshot)

  return doc
}

function serializeFrameToLinkNode(entity: PersistedFrameEntity): JsonCanvasLinkNode {
  const preset = VIEWPORT_PRESETS[entity.presetIndex] ?? VIEWPORT_PRESETS[0]
  const customSize = frameCustomSizeFromMetadata(entity.metadata)
  return {
    id: entity.id,
    type: 'link',
    x: entity.canvasX,
    y: entity.canvasY,
    width: customSize?.width ?? preset?.width ?? 375,
    height: customSize?.height ?? preset?.height ?? 667,
    url: entity.url,
    // App-specific extensions
    presetIndex: entity.presetIndex,
    linked: entity.linked,
    label: entity.name,
    source: entity.source,
    groupId: entity.parentGroupId ?? entity.groupId,
    parentGroupId: entity.parentGroupId ?? entity.groupId,
    metadata: entity.metadata,
  }
}

function serializeTextToTextNode(entity: PersistedTextEntity): JsonCanvasTextNode {
  return {
    id: entity.id,
    type: 'text',
    x: entity.canvasX,
    y: entity.canvasY,
    width: entity.width,
    height: entity.height,
    text: entity.text,
    color: entity.color,
  }
}

function serializeFileToFileNode(entity: PersistedFileEntity): JsonCanvasFileNode {
  return {
    id: entity.id,
    type: 'file',
    x: entity.canvasX,
    y: entity.canvasY,
    width: entity.width,
    height: entity.height,
    file: entity.file,
    subpath: entity.subpath,
    objectFit: entity.objectFit,
    presetIndex: entity.presetIndex,
    metadata: entity.metadata,
  }
}

function serializeShapeToShapeNode(entity: PersistedShapeEntity): JsonCanvasShapeNode {
  return {
    id: entity.id,
    type: 'shape',
    x: entity.canvasX,
    y: entity.canvasY,
    width: entity.width,
    height: entity.height,
    shapeKind: entity.shapeKind,
    text: entity.text,
    color: entity.color,
    strokeWidth: entity.strokeWidth,
    theme: entity.theme,
    label: entity.label,
    parentGroupId: entity.parentGroupId,
  }
}

function serializeDrawingToDrawingNode(entity: PersistedDrawingEntity): JsonCanvasDrawingNode {
  return {
    id: entity.id,
    type: 'drawing',
    x: entity.canvasX,
    y: entity.canvasY,
    width: entity.width,
    height: entity.height,
    strokes: entity.strokes,
    label: entity.label,
    parentGroupId: entity.parentGroupId,
  }
}

function serializeGroupEntityToGroupNode(entity: PersistedGroupEntity): JsonCanvasGroupNode {
  return {
    id: entity.id,
    type: 'group',
    x: entity.canvasX,
    y: entity.canvasY,
    width: entity.width,
    height: entity.height,
    label: entity.label,
    color: entity.color,
    // App-specific extensions
    groupKind: entity.groupKind,
    layoutMode: entity.layoutMode,
    parentGroupId: entity.parentGroupId,
    managedLayout: entity.managedLayout,
    groupColor: entity.color,
    sourceTaskId: entity.sourceTaskId,
    groupMetadata: entity.metadata,
  }
}

function serializeEdge(edge: WorkspaceEdge): JsonCanvasEdge {
  return {
    id: edge.id,
    fromNode: edge.fromEntityId,
    toNode: edge.toEntityId,
    fromSide: edge.fromSide,
    toSide: edge.toSide,
    fromEnd: edge.fromEnd,
    toEnd: edge.toEnd,
    color: edge.color,
    label: edge.label,
    // App-specific extensions
    edgeKind: edge.kind,
    edgeMetadata: edge.metadata,
  }
}

function serializeAppState(snapshot: WorkspaceSnapshot): JsonCanvasAppState {
  return {
    zoom: snapshot.zoom,
    pan: { ...snapshot.pan },
    selectedEntityIds: snapshot.selectedFrameIds ?? [],
    leftSidebarOpen: snapshot.leftSidebarOpen,
    devtoolsOpen: snapshot.devtoolsOpen,
    devtoolsPanelTab: snapshot.devtoolsPanelTab,
    devtoolsWidth: snapshot.devtoolsWidth,
    browserTabMode: snapshot.browserTabMode,
  }
}

// --- Deserialize ---

export function deserializeFromJsonCanvas(doc: JsonCanvasDocument): {
  snapshot: WorkspaceSnapshot
  annotations: Annotation[]
} {
  const entities: Record<string, PersistedCanvasEntity> = {}
  const entityOrder: string[] = []
  for (const node of doc.nodes) {
    if (node.type === 'link') {
      const entity = deserializeLinkNodeToFrame(node)
      entities[entity.id] = entity
      entityOrder.push(entity.id)
    } else if (node.type === 'text') {
      const entity = deserializeTextNodeToText(node)
      entities[entity.id] = entity
      entityOrder.push(entity.id)
    } else if (node.type === 'file') {
      const entity = deserializeFileNodeToFile(node)
      entities[entity.id] = entity
      entityOrder.push(entity.id)
    } else if (node.type === 'group') {
      const entity = deserializeGroupNodeToGroup(node)
      entities[entity.id] = entity
      entityOrder.push(entity.id)
    } else if (node.type === 'drawing') {
      const entity = deserializeDrawingNodeToDrawing(node)
      entities[entity.id] = entity
      entityOrder.push(entity.id)
    } else if (node.type === 'shape') {
      const entity = deserializeShapeNodeToShape(node)
      entities[entity.id] = entity
      entityOrder.push(entity.id)
    }
  }

  const edges: WorkspaceEdge[] = doc.edges.map(deserializeEdgeToWorkspaceEdge)

  const appState = doc.appState ?? { zoom: 1, pan: { x: 0, y: 0 } }

  const snapshot: WorkspaceSnapshot = {
    zoom: appState.zoom ?? 1,
    pan: appState.pan ?? { x: 0, y: 0 },
    pages: [], // Legacy — populated from entities if needed
    entities,
    entityOrder,
    selectedPageIndex: null,
    selectedFrameId: null,
    selectedFrameIds: appState.selectedEntityIds ?? [],
    leftSidebarOpen: appState.leftSidebarOpen ?? true,
    devtoolsOpen: appState.devtoolsOpen ?? false,
    devtoolsPanelTab: (appState.devtoolsPanelTab as DevtoolsPanelTab) ?? 'elements',
    devtoolsWidth: appState.devtoolsWidth ?? 400,
    browserTabMode: (appState.browserTabMode as BrowserTabMode) ?? 'frame',
    edges,
  }

  const annotations = (doc.annotations ?? []) as Annotation[]

  return { snapshot, annotations }
}

function deserializeLinkNodeToFrame(node: JsonCanvasLinkNode): PersistedFrameEntity {
  return {
    kind: 'frame',
    id: node.id,
    name: node.label,
    url: node.url,
    presetIndex: node.presetIndex ?? 0,
    canvasX: node.x,
    canvasY: node.y,
    linked: node.linked ?? false,
    source: node.source as PersistedFrameEntity['source'],
    groupId: node.groupId,
    metadata: node.metadata,
  }
}

function deserializeTextNodeToText(node: JsonCanvasTextNode): PersistedTextEntity {
  return {
    kind: 'text',
    id: node.id,
    text: node.text,
    color: resolveCanvasColor(node.color ?? '3'),
    canvasX: node.x,
    canvasY: node.y,
    width: node.width,
    height: node.height,
  }
}

function deserializeFileNodeToFile(node: JsonCanvasFileNode): PersistedFileEntity {
  return {
    kind: 'file',
    id: node.id,
    file: node.file,
    subpath: node.subpath,
    canvasX: node.x,
    canvasY: node.y,
    width: node.width,
    height: node.height,
    objectFit: node.objectFit,
    presetIndex: node.presetIndex,
    metadata: node.metadata,
  }
}

function deserializeShapeNodeToShape(node: JsonCanvasShapeNode): PersistedShapeEntity {
  return {
    kind: 'shape',
    id: node.id,
    shapeKind: node.shapeKind,
    text: node.text ?? '',
    color: node.color,
    strokeWidth: node.strokeWidth,
    theme: node.theme,
    canvasX: node.x,
    canvasY: node.y,
    width: node.width,
    height: node.height,
    label: node.label,
    parentGroupId: node.parentGroupId,
  }
}

function deserializeDrawingNodeToDrawing(node: JsonCanvasDrawingNode): PersistedDrawingEntity {
  return {
    kind: 'drawing',
    id: node.id,
    canvasX: node.x,
    canvasY: node.y,
    width: node.width,
    height: node.height,
    strokes: node.strokes,
    label: node.label,
    parentGroupId: node.parentGroupId,
  }
}

function deserializeGroupNodeToGroup(node: JsonCanvasGroupNode): PersistedGroupEntity {
  return {
    id: node.id,
    kind: 'group',
    label: node.label ?? '',
    canvasX: node.x,
    canvasY: node.y,
    width: node.width,
    height: node.height,
    parentGroupId: node.parentGroupId,
    color: node.groupColor ?? node.color,
    groupKind: (node.groupKind as PersistedGroupEntity['groupKind']) ?? 'manual',
    layoutMode: (node.layoutMode as PersistedGroupEntity['layoutMode']) ?? 'freeform',
    managedLayout: node.managedLayout ?? false,
    sourceTaskId: node.sourceTaskId,
    metadata: node.groupMetadata,
  }
}

function deserializeEdgeToWorkspaceEdge(edge: JsonCanvasEdge): WorkspaceEdge {
  return {
    id: edge.id,
    fromEntityId: edge.fromNode,
    toEntityId: edge.toNode,
    fromSide: edge.fromSide,
    toSide: edge.toSide,
    fromEnd: edge.fromEnd,
    toEnd: edge.toEnd,
    color: edge.color,
    label: edge.label,
    kind: (edge.edgeKind as WorkspaceEdge['kind']) ?? 'breakpoint_variant',
    metadata: edge.edgeMetadata,
  }
}
