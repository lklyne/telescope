/**
 * Sidebar tree builder — turns the structural partition (`shared/sidebar-partition`)
 * into UI items for the left panel.
 */

import type {
  LeftSidebarData,
  SidebarCanvasItem,
  SidebarDrawingItem,
  SidebarFileItem,
  SidebarGroupItem,
  SidebarPageItem,
  SidebarSections,
  SidebarShapeItem,
  SidebarTextItem,
  WorkspaceGroup,
} from '../../shared/types'
import {
  interactionState,
  pages,
} from './runtime-context'
import type { Page } from './runtime-entities'
import {
  activeWorkspaceTabId,
  workspaceGroups,
} from './workspace-model'
import { leftSidebarView } from './view-refs'
import {
  leftSidebarOpen as uiLeftSidebarOpen,
  selectedEntityIds as uiSelectedEntityIds,
  selectedGroupId as uiSelectedGroupId,
  workspaceViewMode as uiWorkspaceViewMode,
} from '../ui-state'
import { textEntities, type TextEntity } from './text-entity-state'
import { fileEntities, type FileEntity } from './file-entity-state'
import { drawingEntitiesForUi, type DrawingEntity } from './drawing-entity-state'
import { shapeEntities, type ShapeEntity } from './shape-entity-state'
import { pageDisplayLabel } from './runtime-serialization'
import { workspaceTabSummaries } from './workspace-tabs'
import { LEFT_SIDEBAR_WIDTH } from './runtime-constants'
import { getEntityOrder } from './entity-order-state'
import {
  partitionSidebar,
  type PartitionLeaf,
  type PartitionTreeNode,
} from '../../shared/sidebar-partition'

type SidebarLeafItem =
  | SidebarPageItem
  | SidebarTextItem
  | SidebarFileItem
  | SidebarDrawingItem
  | SidebarShapeItem

interface EntityIndex {
  pages: Map<string, Page>
  text: Map<string, TextEntity>
  file: Map<string, FileEntity>
  drawing: Map<string, DrawingEntity>
  shape: Map<string, ShapeEntity>
  groups: Map<string, WorkspaceGroup>
}

function buildEntityIndex(): EntityIndex {
  return {
    pages: new Map(pages.map((p) => [p.id, p])),
    text: new Map(textEntities.map((e) => [e.id, e])),
    file: new Map(fileEntities.map((e) => [e.id, e])),
    drawing: new Map(drawingEntitiesForUi().map((e) => [e.id, e])),
    shape: new Map(shapeEntities.map((e) => [e.id, e])),
    groups: new Map(workspaceGroups.map((g) => [g.id, g])),
  }
}

function buildSidebarLeafItem(entityId: string, index: EntityIndex): SidebarLeafItem | null {
  const page = index.pages.get(entityId)
  if (page) {
    return {
      kind: 'page',
      id: entityId,
      label: pageDisplayLabel(page),
      faviconUrl: page.faviconUrl ?? null,
      width: page.peekWidth,
      height: page.peekHeight,
    }
  }

  const te = index.text.get(entityId)
  if (te) {
    return {
      kind: 'text',
      id: entityId,
      label: te.label || te.text || 'Text',
      color: te.color,
    }
  }

  const fe = index.file.get(entityId)
  if (fe) {
    const fileName = fe.file.split('/').pop() ?? fe.file
    const displayName = fileName
      .replace(/\.wireframe\.json$/i, '')
      .replace(/\.md$/i, '')
    return {
      kind: 'file',
      id: entityId,
      label: displayName,
      file: fe.file,
    }
  }

  const de = index.drawing.get(entityId)
  if (de) {
    const defaultLabel = `Drawing (${de.strokes.length} stroke${de.strokes.length === 1 ? '' : 's'})`
    return {
      kind: 'drawing',
      id: entityId,
      label: de.label || defaultLabel,
      strokeCount: de.strokes.length,
    }
  }

  const se = index.shape.get(entityId)
  if (se) {
    const trimmed = se.text.trim()
    const defaultLabel =
      se.shapeKind === 'ellipse' ? 'Ellipse' : se.shapeKind === 'diamond' ? 'Diamond' : 'Rectangle'
    return {
      kind: 'shape',
      id: entityId,
      label: se.label || trimmed || defaultLabel,
      shapeKind: se.shapeKind,
    }
  }

  return null
}

function collectPartitionLeaves(index: EntityIndex): PartitionLeaf[] {
  const out: PartitionLeaf[] = []
  for (const p of index.pages.values()) out.push({ id: p.id, surface: 'pages', parentGroupId: p.parentGroupId ?? null })
  for (const e of index.text.values()) out.push({ id: e.id, surface: 'notes', parentGroupId: e.parentGroupId ?? null })
  for (const e of index.file.values()) out.push({ id: e.id, surface: 'notes', parentGroupId: e.parentGroupId ?? null })
  for (const e of index.drawing.values()) out.push({ id: e.id, surface: 'notes', parentGroupId: e.parentGroupId ?? null })
  for (const e of index.shape.values()) out.push({ id: e.id, surface: 'notes', parentGroupId: e.parentGroupId ?? null })
  return out
}

function decorateNode(node: PartitionTreeNode, index: EntityIndex): SidebarCanvasItem | null {
  if (!node.isGroup) return buildSidebarLeafItem(node.id, index)

  const group = index.groups.get(node.id)
  if (!group) return null

  const children: SidebarCanvasItem[] = []
  for (const child of node.children) {
    const decorated = decorateNode(child, index)
    if (decorated) children.push(decorated)
  }

  const item: SidebarGroupItem = {
    kind: 'group',
    id: node.id,
    label: group.label,
    entityCount: node.surfaceLeafCount,
    children,
  }
  return item
}

function decorateSection(nodes: PartitionTreeNode[], index: EntityIndex): SidebarCanvasItem[] {
  const out: SidebarCanvasItem[] = []
  for (const node of nodes) {
    const decorated = decorateNode(node, index)
    if (decorated) out.push(decorated)
  }
  return out
}

export function buildSidebarSections(): SidebarSections {
  const index = buildEntityIndex()
  const partition = partitionSidebar(
    collectPartitionLeaves(index),
    [...index.groups.values()].map((g) => ({ id: g.id, parentGroupId: g.parentGroupId ?? null })),
    getEntityOrder(),
  )
  return {
    notes: decorateSection(partition.notes, index),
    pages: decorateSection(partition.pages, index),
  }
}

export function buildLeftSidebarData(): LeftSidebarData {
  return {
    width: uiLeftSidebarOpen() ? LEFT_SIDEBAR_WIDTH : 0,
    selectedEntityIds: uiSelectedEntityIds(),
    selectedGroupId: uiSelectedGroupId(),
    tabs: workspaceTabSummaries(),
    activeTabId: activeWorkspaceTabId,
    viewMode: uiWorkspaceViewMode(),
    hasPages: pages.length > 0,
    sections: buildSidebarSections(),
  }
}

export function getLeftSidebarData(): LeftSidebarData {
  return buildLeftSidebarData()
}

export function notifyLeftSidebarData(): void {
  if (!leftSidebarView) return
  const wc = leftSidebarView.webContents
  if (wc.isDestroyed()) return
  if (interactionState.kind === 'dragging-entities') return
  wc.send('left-sidebar-data', buildLeftSidebarData())
}
