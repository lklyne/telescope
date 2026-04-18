import { ipcMain } from 'electron'
import { DRAWING_FEATURE_ENABLED } from '../../shared/featureFlags'
import type { CanvasEntityKind } from '../../shared/types'
import type { EdgeSide } from '../../shared/types'
import { pages } from '../runtime/page-runtime'
import { aboveView } from '../runtime/view-refs'
import { setCommentOverlayActive } from '../runtime/runtime-core'
import { setHoverEntity, setHoveredFrame } from '../runtime/runtime-core'
import { annotationMode as uiAnnotationMode, selectedCanvasTargets as uiSelectedCanvasTargets } from '../ui-state'
import {
  canvasOrigin,
  layoutAllViews,
  pan,
  requestLayout,
  zoom,
} from '../runtime/surface-layout'
import { saveImageBuffer } from '../runtime/image-assets'
import { imageSizeFromBuffer } from '../runtime/image-sizing'
import {
  cancelPendingPlacement,
  clearFocus,
  focusSelectedPage,
  getSelectedEntityIds,
  selectEntity,
  selectPage,
  selectPageById,
  selectedPageId,
  setFocus,
  setSelectedEntities,
} from '../runtime/ui-actions'
import {
  interactionBlocksPageHover,
  interactionBlocksPageSelection,
} from '../runtime/interaction-state'
import { tryEnter, commitActive } from '../runtime/interaction-controller'
import { setTextEditingActive } from '../runtime/keyboard-shortcuts'
import {
  createWorkspaceTab,
  deleteWorkspaceTab,
  duplicateWorkspaceTab,
  renameWorkspaceDrawingEntity,
  renameWorkspaceFileEntity,
  renameWorkspaceFrame,
  renameWorkspaceGroup,
  renameWorkspaceTab,
  renameWorkspaceTextEntity,
  reorderWorkspaceTab,
  scheduleWorkspaceAutosave,
  setActiveWorkspaceTab,
  setWorkspaceTabExpanded,
} from '../runtime/workspace-session'
import { setFrameSizeMode } from '../runtime/runtime-entities'
import type { FrameSizeMode } from '../../shared/types'
import { createEdges, deleteEdges } from '../workspace-edges'
import { selectEntitiesInRect } from '../workspace-entities'
import { createFileEntity } from '../runtime/document-commands'
import { enterGroup, selectGroup, selectNone } from '../runtime/selection-controller'
import { consumeDragId } from '../runtime/drop-owner'
import { registerCanvasDragIpc } from './register-canvas-drag-ipc'
import { registerCanvasEntityIpc } from './register-canvas-entity-ipc'

export function registerCanvasIpc(): void {
  registerCanvasDragIpc()
  registerCanvasEntityIpc()

  // --- Selection ---

  ipcMain.on(
    'canvas-select-in-rect',
    (_event, bounds: { x: number; y: number; width: number; height: number }) => {
      selectEntitiesInRect(bounds)
    },
  )

  ipcMain.on('canvas-clear-annotate-hover', () => {
    for (const page of pages) {
      if (page.pageView.webContents.isDestroyed()) continue
      page.pageView.webContents.send('annotate-clear-hover')
    }
  })

  ipcMain.on('canvas-select-frame', (_event, { frameId }: { frameId: string }) => {
    if (interactionBlocksPageSelection()) return
    const idx = pages.findIndex((candidate) => candidate.id === frameId)
    if (idx === -1) return
    selectPage(idx)
  })

  ipcMain.on('canvas-click-at', (_event, { screenX, screenY }: { screenX: number; screenY: number }) => {
    if (interactionBlocksPageSelection()) return
    const origin = canvasOrigin()
    const canvasX = (screenX - origin.x - pan.x) / zoom
    const canvasY = (screenY - origin.y - pan.y) / zoom
    // Use a 1x1 rect at the click point for hit-testing.
    // Drawings are hit-tested in the renderer (SVG stroke hit-paths), not by bbox here.
    selectEntitiesInRect(
      { x: canvasX, y: canvasY, width: 1, height: 1 },
      { includeDrawings: false },
    )
  })

  ipcMain.on('canvas-select-in-screen-rect', (_event, rect: { x: number; y: number; width: number; height: number }) => {
    if (interactionBlocksPageSelection()) return
    const origin = canvasOrigin()
    const canvasX = (rect.x - origin.x - pan.x) / zoom
    const canvasY = (rect.y - origin.y - pan.y) / zoom
    selectEntitiesInRect({ x: canvasX, y: canvasY, width: rect.width / zoom, height: rect.height / zoom })
  })

  ipcMain.on('canvas-select-entities', (_event, entityIds: string[]) => {
    setSelectedEntities(entityIds)
    layoutAllViews()
  })

  const VALID_ENTITY_KINDS: ReadonlySet<CanvasEntityKind> = new Set<CanvasEntityKind>(
    DRAWING_FEATURE_ENABLED ? ['frame', 'text', 'file', 'drawing', 'edge'] : ['frame', 'text', 'file', 'edge'],
  )

  ipcMain.on(
    'canvas-select-entity',
    (_event, { entityId, entityKind }: { entityId: string; entityKind: string }) => {
      if (!VALID_ENTITY_KINDS.has(entityKind as CanvasEntityKind)) return
      if (entityKind === 'frame' && interactionBlocksPageSelection()) return
      selectEntity(entityId, entityKind)
    },
  )

  ipcMain.on('canvas-select-group', (_event, { groupId }: { groupId: string }) => {
    selectGroup(groupId, { clearInteraction: true })
  })

  ipcMain.on('canvas-enter-group', (_event, { groupId }: { groupId: string }) => {
    enterGroup(groupId, { clearInteraction: true })
  })

  ipcMain.on('canvas-hover-frame', (_event, { frameId }: { frameId: string | null }) => {
    if (interactionBlocksPageHover()) return
    if (uiAnnotationMode() === 'region_select') return
    setHoveredFrame(frameId)
  })

  ipcMain.on('canvas-set-text-editing', (event, { active }: { active: boolean }) => {
    setTextEditingActive(event.sender, active)
    if (active) {
      const selectedTextId = uiSelectedCanvasTargets().find((target) => target.kind === 'text')?.id
      if (selectedTextId) tryEnter({ kind: 'editing-text', entityId: selectedTextId })
    } else {
      commitActive()
    }
  })

  // --- Focus ---

  ipcMain.on('canvas-set-focus', (_event, { entityId, entityKind }: { entityId: string; entityKind: CanvasEntityKind }) => {
    setFocus(entityId, entityKind)
  })

  ipcMain.on('canvas-clear-focus', () => {
    clearFocus()
  })

  ipcMain.on(
    'canvas-set-frame-size-mode',
    (_event, { frameId, mode }: { frameId: string; mode: FrameSizeMode }) => {
      const page = pages.find((candidate) => candidate.id === frameId)
      if (!page) return
      page.metadata = setFrameSizeMode(page.metadata, mode)
      scheduleWorkspaceAutosave()
      layoutAllViews()
    },
  )

  // --- Tab management ---

  ipcMain.on('canvas-select-tab', (_event, { tabId }: { tabId: string }) => {
    setActiveWorkspaceTab(tabId)
  })

  ipcMain.on('canvas-create-tab', () => {
    createWorkspaceTab()
  })

  ipcMain.on(
    'canvas-rename-tab',
    (_event, { tabId, name }: { tabId: string; name: string }) => {
      renameWorkspaceTab(tabId, name)
    },
  )

  ipcMain.on(
    'canvas-rename-frame',
    (_event, { frameId, name }: { frameId: string; name: string }) => {
      renameWorkspaceFrame(frameId, name)
    },
  )

  ipcMain.on(
    'canvas-rename-group',
    (_event, { groupId, name }: { groupId: string; name: string }) => {
      renameWorkspaceGroup(groupId, name)
    },
  )

  ipcMain.on(
    'canvas-rename-file-entity',
    (_event, { entityId, name }: { entityId: string; name: string }) => {
      renameWorkspaceFileEntity(entityId, name)
    },
  )

  ipcMain.on(
    'canvas-rename-text-entity',
    (_event, { entityId, name }: { entityId: string; name: string }) => {
      renameWorkspaceTextEntity(entityId, name)
    },
  )

  ipcMain.on(
    'canvas-rename-drawing-entity',
    (_event, { entityId, name }: { entityId: string; name: string }) => {
      renameWorkspaceDrawingEntity(entityId, name)
    },
  )

  ipcMain.on('canvas-duplicate-tab', (_event, { tabId }: { tabId: string }) => {
    duplicateWorkspaceTab(tabId)
  })

  ipcMain.on('canvas-delete-tab', (_event, { tabId }: { tabId: string }) => {
    deleteWorkspaceTab(tabId)
  })

  ipcMain.on(
    'canvas-reorder-tab',
    (_event, { tabId, toIndex }: { tabId: string; toIndex: number }) => {
      reorderWorkspaceTab(tabId, toIndex)
    },
  )

  ipcMain.on(
    'canvas-set-tab-expanded',
    (_event, { tabId, expanded }: { tabId: string; expanded: boolean }) => {
      setWorkspaceTabExpanded(tabId, expanded)
    },
  )

  // --- Edge operations ---

  ipcMain.on(
    'canvas-create-edge',
    (
      _event,
      {
        fromEntityId,
        toEntityId,
        fromSide,
        toSide,
      }: {
        fromEntityId: string
        toEntityId: string
        fromSide?: EdgeSide
        toSide?: EdgeSide
      },
    ) => {
      if (!fromSide || !toSide) return
      createEdges({
        edges: [
          {
            fromEntityId,
            toEntityId,
            fromSide,
            toSide,
            toEnd: 'arrow',
            kind: 'connection',
          },
        ],
      })
      commitActive()
      setHoverEntity(null)
      layoutAllViews()
    },
  )

  ipcMain.on('canvas-delete-edge', (_event, { edgeId }: { edgeId: string }) => {
    deleteEdges({ edgeIds: [edgeId] })
    layoutAllViews()
  })

  ipcMain.on('canvas-select-edge', (_event, { edgeId }: { edgeId: string | null }) => {
    if (!edgeId) {
      selectNone()
      return
    }
    selectEntity(edgeId, 'edge')
    layoutAllViews()
  })

  // --- File drop ---
  //
  // Electron dispatches drop events to every overlapping WCV (gotcha #9).
  // Preferred path: renderer stamps a unique dragId on dragstart and
  // forwards it through — DropOwner.consumeDragId ensures the first
  // delivery wins and the rest are ignored (spec §4.5, invariant I5).
  //
  // Legacy path: payload-hash + 500ms window. Kept as fallback until
  // every preload bridge stamps a dragId (Phase 5 cutover).

  let lastDropKey = ''
  let lastDropTime = 0

  ipcMain.on(
    'canvas-drop-file-buffer',
    (
      _event,
      {
        buffer,
        ext,
        canvasX,
        canvasY,
        dragId,
      }: { buffer: Buffer; ext: string; canvasX: number; canvasY: number; dragId?: string },
    ) => {
      if (dragId) {
        if (consumeDragId(dragId)) return
      } else {
        const dropKey = `${buffer.length}:${ext}:${canvasX}:${canvasY}`
        const now = Date.now()
        if (dropKey === lastDropKey && now - lastDropTime < 500) return
        lastDropKey = dropKey
        lastDropTime = now
      }

      const file = saveImageBuffer(buffer, ext)
      const { width, height } = imageSizeFromBuffer(buffer)
      createFileEntity({ canvasX, canvasY, file, width, height })
    },
  )

}
