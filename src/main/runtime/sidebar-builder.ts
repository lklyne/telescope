/**
 * Sidebar tree builder — turns the structural partition (`shared/sidebar-partition`)
 * into UI items for the left panel.
 *
 * Per ADR 0006: items within each section are ordered by `entityOrder`,
 * frontmost-first (top of section = top of stack). Groups with members on
 * both paint surfaces emit one row per surface (split representation), sharing
 * the same group id and label but exposing only the children on that surface.
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
} from '../../shared/types'
import {
  findPageById,
  interactionState,
  pages,
} from './runtime-context'
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
import { textEntities } from './text-entity-state'
import { fileEntities } from './file-entity-state'
import { drawingEntitiesForUi } from './drawing-entity-state'
import { shapeEntities } from './shape-entity-state'
import { pageDisplayLabel } from './runtime-serialization'
import { workspaceTabSummaries } from './workspace-tabs'
import { LEFT_SIDEBAR_WIDTH } from './runtime-constants'
import { getEntityOrder } from './workspace-doc'
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

function buildSidebarLeafItem(entityId: string): SidebarLeafItem | null {
  const page = findPageById(entityId)
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

  const te = textEntities.find((entity) => entity.id === entityId)
  if (te) {
    return {
      kind: 'text',
      id: entityId,
      label: te.label || te.text || 'Text',
      color: te.color,
    }
  }

  const fe = fileEntities.find((entity) => entity.id === entityId)
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

  const de = drawingEntitiesForUi().find((entity) => entity.id === entityId)
  if (de) {
    const defaultLabel = `Drawing (${de.strokes.length} stroke${de.strokes.length === 1 ? '' : 's'})`
    return {
      kind: 'drawing',
      id: entityId,
      label: de.label || defaultLabel,
      strokeCount: de.strokes.length,
    }
  }

  const se = shapeEntities.find((entity) => entity.id === entityId)
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

function collectPartitionLeaves(): PartitionLeaf[] {
  const out: PartitionLeaf[] = []
  for (const p of pages) out.push({ id: p.id, surface: 'pages', parentGroupId: p.parentGroupId ?? null })
  for (const e of textEntities) out.push({ id: e.id, surface: 'notes', parentGroupId: e.parentGroupId ?? null })
  for (const e of fileEntities) out.push({ id: e.id, surface: 'notes', parentGroupId: e.parentGroupId ?? null })
  for (const e of drawingEntitiesForUi()) out.push({ id: e.id, surface: 'notes', parentGroupId: e.parentGroupId ?? null })
  for (const e of shapeEntities) out.push({ id: e.id, surface: 'notes', parentGroupId: e.parentGroupId ?? null })
  return out
}

function decorateNode(node: PartitionTreeNode): SidebarCanvasItem | null {
  if (!node.isGroup) return buildSidebarLeafItem(node.id)

  const group = workspaceGroups.find((g) => g.id === node.id)
  if (!group) return null

  const children: SidebarCanvasItem[] = []
  for (const child of node.children) {
    const decorated = decorateNode(child)
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

function decorateSection(nodes: PartitionTreeNode[]): SidebarCanvasItem[] {
  const out: SidebarCanvasItem[] = []
  for (const node of nodes) {
    const decorated = decorateNode(node)
    if (decorated) out.push(decorated)
  }
  return out
}

export function buildSidebarSections(): SidebarSections {
  const partition = partitionSidebar(
    collectPartitionLeaves(),
    workspaceGroups.map((g) => ({ id: g.id, parentGroupId: g.parentGroupId ?? null })),
    getEntityOrder(),
  )
  return {
    notes: decorateSection(partition.notes),
    pages: decorateSection(partition.pages),
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
