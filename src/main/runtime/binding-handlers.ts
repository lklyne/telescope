import type { BindingContext, BindingId } from '../../shared/bindings'
import { DRAWING_FEATURE_ENABLED } from '../../shared/featureFlags'
import { setActiveTool } from './tool-mode'
import { applyToolDefaultPatch } from './tool-defaults'
import { undo, redo } from './workspace-undo'
import { setZoom, setPan, focusSelectedPage } from './viewport-control'
import { layoutAllViews } from './layout-engine'
import { groupSelectedEntities, ungroupSelectedGroup } from './document-commands'
import { selectAdjacentPage } from './selection-state'
import { selectEntities, selectNone } from './selection-controller'
import { markDirty } from './layout-dirty'
import { requestLayout } from './surface-layout'
import { arrowNavigationLocked, setArrowNavigationLocked, pages, selectedPageId } from './runtime-context'
import { selectedCanvasTargets as uiSelectedCanvasTargets } from '../ui-state'
import { deletePages } from '../workspace-entities'
import { deleteEdges } from '../workspace-edges'
import { deleteTextEntity, textEntities } from './text-entity-state'
import { deleteFileEntity, fileEntities } from './file-entity-state'
import { deleteDrawingEntity, drawingEntities } from './drawing-entity-state'
import { deleteShapeEntity, shapeEntities } from './shape-entity-state'
import { duplicatePageFromSource, duplicateEntity } from '../workspace-pages'
import { selectBrowserTab } from './runtime-core'

type MainBindingId = Exclude<BindingId, 'annotation-close-thread' | 'annotation-clear-draft'>

export const mainHandlers: Record<MainBindingId, (ctx: BindingContext) => void> = {
  'tool-select': () => {
    setActiveTool({ kind: 'select' })
  },
  'tool-add-page': () => {
    setActiveTool({ kind: 'add-page' })
  },
  'tool-add-text-plain': () => {
    setActiveTool({ kind: 'add-text', style: 'plain' })
  },
  'tool-add-text-sticky': () => {
    setActiveTool({ kind: 'add-text', style: 'sticky' })
  },
  'tool-add-shape-rectangle': () => {
    setActiveTool({ kind: 'add-shape' })
    applyToolDefaultPatch({ scope: 'add-shape', key: 'shapeKind', value: 'rectangle' })
  },
  'tool-add-shape-ellipse': () => {
    setActiveTool({ kind: 'add-shape' })
    applyToolDefaultPatch({ scope: 'add-shape', key: 'shapeKind', value: 'ellipse' })
  },
  'tool-add-shape-diamond': () => {
    setActiveTool({ kind: 'add-shape' })
    applyToolDefaultPatch({ scope: 'add-shape', key: 'shapeKind', value: 'diamond' })
  },
  'tool-comment': () => {
    setActiveTool({ kind: 'comment' })
  },
  'tool-draw-pen': () => {
    if (!DRAWING_FEATURE_ENABLED) return
    setActiveTool({ kind: 'draw' })
    applyToolDefaultPatch({ scope: 'draw', key: 'brushType', value: 'pen' })
  },
  'tool-draw-highlight': () => {
    if (!DRAWING_FEATURE_ENABLED) return
    setActiveTool({ kind: 'draw' })
    applyToolDefaultPatch({ scope: 'draw', key: 'brushType', value: 'highlight' })
  },
  'tool-inspect': () => {
    setActiveTool({ kind: 'inspect' })
  },
  'undo': () => {
    undo()
  },
  'redo': () => {
    redo()
  },
  'reset-viewport': () => {
    setZoom(1.0)
    if (!focusSelectedPage()) {
      setPan(0, 0)
      layoutAllViews()
    }
  },
  'group': () => {
    groupSelectedEntities()
  },
  'ungroup': () => {
    ungroupSelectedGroup()
  },
  'select-all': () => {
    selectAllEntities()
  },
  'duplicate': () => {
    duplicateSelection()
  },
  'delete-selection': () => {
    deleteSelection()
  },
  'nav-left': () => {
    selectAdjacentPageOnce('left')
  },
  'nav-right': () => {
    selectAdjacentPageOnce('right')
  },
  'nav-up': () => {
    selectAdjacentPageOnce('up')
  },
  'nav-down': () => {
    selectAdjacentPageOnce('down')
  },
  'escape-tool': (ctx) => {
    // While text editing, the renderer commits the edit natively via DOM keydown.
    // Returning here prevents the tool from also being reset on the same keypress.
    if (ctx.isTextEditing) return
    setActiveTool({ kind: 'select' })
  },
  'escape-page-focus': () => {
    selectNone()
    markDirty('canvas')
    requestLayout()
  },
  'close-tab': (ctx) => {
    const pageId = selectedPageId()
    if (!pageId) return
    const isBrowser = ctx.viewMode === 'browser'
    let nextTabId: string | null = null
    if (isBrowser) {
      const idx = pages.findIndex((p) => p.id === pageId)
      const next = pages[idx + 1] ?? pages[idx - 1] ?? null
      nextTabId = next?.id ?? null
    }
    deletePages({ pageIds: [pageId] })
    if (isBrowser && nextTabId) {
      selectBrowserTab(nextTabId)
    }
  },
}

type ArrowDirection = 'left' | 'right' | 'up' | 'down'

function selectAdjacentPageOnce(direction: ArrowDirection): void {
  if (arrowNavigationLocked) return
  const changed = selectAdjacentPage(direction)
  if (!changed) return
  setArrowNavigationLocked(true)
  setTimeout(() => {
    setArrowNavigationLocked(false)
  }, 0)
}

export function selectAllEntities(): void {
  const entityIds = [
    ...pages.map((p) => p.id),
    ...textEntities.map((e) => e.id),
    ...fileEntities.map((e) => e.id),
    ...shapeEntities.map((e) => e.id),
    ...drawingEntities.map((e) => e.id),
  ]
  if (!entityIds.length) return
  selectEntities(entityIds)
}

function duplicateSelection(): void {
  const targets = uiSelectedCanvasTargets()
  if (!targets.length) return
  const target = targets[0]
  if (!target) return
  if (target.kind === 'page') {
    duplicatePageFromSource({ sourcePageId: target.id, focus: true, skipGrouping: true })
  } else {
    duplicateEntity({ entityId: target.id, focus: true })
  }
}

function deleteSelection(): void {
  const targets = uiSelectedCanvasTargets()
  if (!targets.length) return
  const edgeIds = targets.filter((t) => t.kind === 'edge').map((t) => t.id)
  if (edgeIds.length) deleteEdges({ edgeIds })
  const entityIds = targets.filter((t) => t.kind !== 'edge').map((t) => t.id)
  if (!entityIds.length) {
    layoutAllViews()
    return
  }
  const pageIds = entityIds.filter((id) => pages.some((p) => p.id === id))
  const textIds = entityIds.filter((id) => textEntities.some((n) => n.id === id))
  const fileIds = entityIds.filter((id) => fileEntities.some((f) => f.id === id))
  const drawingIds = entityIds.filter((id) => drawingEntities.some((d) => d.id === id))
  const shapeIds = entityIds.filter((id) => shapeEntities.some((s) => s.id === id))
  if (pageIds.length) deletePages({ pageIds })
  for (const id of textIds) deleteTextEntity(id)
  for (const id of fileIds) deleteFileEntity(id)
  for (const id of drawingIds) deleteDrawingEntity(id)
  for (const id of shapeIds) deleteShapeEntity(id)
}
