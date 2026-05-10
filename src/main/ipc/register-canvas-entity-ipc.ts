import { clipboard, ipcMain, Menu, shell } from 'electron'
import { VIEWPORT_PRESETS } from '../../shared/constants'
import { DRAWING_FEATURE_ENABLED } from '../../shared/featureFlags'
import type {
  AnnotationCreateRequest,
  ClipboardPageSelectionPayload,
  ClipboardEntitySelectionPayload,
} from '../../shared/types'
import { pages } from '../runtime/page-runtime'
import { aboveView } from '../runtime/view-refs'
import { beginEditingEntity } from '../runtime/editing-entity-runtime'
import { setPendingFocus } from '../runtime/runtime-context'
import { executeRegionSelect } from '../runtime/region-select'
import { queryElementAtPoint } from '../runtime/page-queries'
import {
  pageAtWindowPoint,
  windowPointToCanvasPoint,
} from '../runtime/window-coords'
import { setCommentOverlayActive } from '../runtime/runtime-core'
import { textEntities } from '../runtime/text-entity-state'
import { fileEntities } from '../runtime/file-entity-state'
import { drawingEntities, createDrawingEntity as createDrawingEntityInState } from '../runtime/drawing-entity-state'
import { shapeEntities } from '../runtime/shape-entity-state'
import {
  createFileEntity,
  createShapeEntity,
  createTextEntity,
  deleteDrawingEntity,
  deleteShapeEntity,
  deleteTextEntity,
  deleteFileEntity,
  setPageCustom,
  setPagePreset,
  updateDrawingEntity,
  updateFileEntity,
  updateGroupEntity,
  updateShapeEntity,
  updateTextEntity,
  resizeMultiSelection,
  groupSelectedEntities,
  ungroupSelectedGroup,
} from '../runtime/document-commands'
import type { MultiResizeEntry } from '../runtime/document-commands'
import { createNoteFile, readNoteFile, writeNoteFile, renameNoteFile } from '../runtime/note-assets'
import { saveImageBuffer } from '../runtime/image-assets'
import {
  activeTool,
  finishOneShotPlacement,
  focusCanvasBounds,
  focusSelectedPage,
  getSelectedEntityIds,
  selectEntity,
  openDevToolsForSelectedPage,
  selectPage,
  selectPageById,
  selectedPageId,
  setActiveTool,
  setSelectedEntities,
} from '../runtime/ui-actions'
import {
  layoutAllViews,
  requestLayout,
  snapToGrid,
} from '../runtime/surface-layout'
import { markDirty } from '../runtime/layout-dirty'
import { pageContentSize } from '../runtime/runtime-geometry'
import { CHROME_HEADER_HEIGHT } from '../runtime/runtime-constants'
import {
  scheduleWorkspaceAutosave,
} from '../runtime/workspace-session'
import { navigatePage, togglePageLinked } from '../navigation-sync'
import {
  deviceIdFromMetadata,
  pageUsesCustomSize,
  setCustomPageSizeMetadata,
  setDeviceIdMetadata,
} from '../runtime/runtime-entities'
import { createAnnotation, moveAnnotation } from '../workspace-annotations'
import { deleteEdges } from '../workspace-edges'
import {
  deletePages,
  groupBoundsForEntityIds,
} from '../workspace-entities'
import { findDuplicatePlacement } from '../workspace-placement'
import {
  createPageAtPosition,
  duplicateEntity,
  duplicatePageFromSource,
  tidySelectedPages,
} from '../workspace-pages'
import { deleteGroups, duplicateGroup, ungroupUserGroup } from '../workspace-groups'
import {
  copyablePagePayload,
  copyableSelectionPayload,
  pasteEntitiesFromClipboard,
  pastePagesFromClipboard,
} from '../workspace-clipboard'
import { workspaceGroups } from '../runtime/workspace-model'
import { selectGroup } from '../runtime/selection-controller'
import { selectedCanvasTargets as uiSelectedCanvasTargets } from '../ui-state'

const CLIPBOARD_PREFIX_V1 = 'web-canvas:pages:'
const CLIPBOARD_PREFIX = 'web-canvas:entities:'

function parseClipboardSelection(
  rawText: string,
): ClipboardEntitySelectionPayload | ClipboardPageSelectionPayload | null {
  // Try v2 (entities) format first
  if (rawText.startsWith(CLIPBOARD_PREFIX)) {
    try {
      const parsed = JSON.parse(
        rawText.slice(CLIPBOARD_PREFIX.length),
      ) as ClipboardEntitySelectionPayload
      if (parsed?.version === 2 && Array.isArray(parsed.entities)) {
        return parsed
      }
    } catch {
      // fall through
    }
  }

  // Backward compat: v1 (pages-only) format
  if (rawText.startsWith(CLIPBOARD_PREFIX_V1)) {
    try {
      const parsed = JSON.parse(
        rawText.slice(CLIPBOARD_PREFIX_V1.length),
      ) as ClipboardPageSelectionPayload
      if (parsed?.version === 1 && Array.isArray(parsed.pages)) {
        return parsed
      }
    } catch {
      // fall through
    }
  }

  return null
}


export function registerCanvasEntityIpc(): void {
  ipcMain.on(
    'canvas-place-pending-entity',
    (
      _event,
      payload: {
        canvasX: number
        canvasY: number
        dragRect?: { x: number; y: number; width: number; height: number } | null
      },
    ) => {
      const { canvasX, canvasY } = payload
      const dragRect = payload.dragRect ?? null
      const tool = activeTool()
      if (tool.kind === 'add-text') {
        createTextEntity({
          canvasX,
          canvasY,
          textStyle: tool.style,
        })
      } else if (tool.kind === 'add-document') {
        try {
          const filePath = createNoteFile()
          createFileEntity({ canvasX, canvasY, file: filePath, width: 300, height: 300 })
        } catch (error) {
          console.error('Failed to create note file:', error)
        }
      } else if (tool.kind === 'add-shape') {
        const shapeKind = tool.shapeKind
        const created = dragRect
          ? createShapeEntity({
              canvasX: dragRect.x,
              canvasY: dragRect.y,
              width: dragRect.width,
              height: dragRect.height,
              shapeKind,
            })
          : createShapeEntity({ canvasX, canvasY, shapeKind })
        selectEntity(created.id, 'shape')
        beginEditingEntity(created.id)
      } else if (tool.kind === 'add-page') {
        createPageAtPosition({
          sourcePageId: tool.sourcePageId,
          presetIndex: tool.presetIndex ?? 0,
          customSize: tool.customSize ?? false,
          canvasX,
          canvasY: canvasY - CHROME_HEADER_HEIGHT,
          mode: 'add_from_toolbar',
          focus: true,
        })
      } else {
        return
      }
      finishOneShotPlacement()
    },
  )

  ipcMain.on('canvas-delete-selection', () => {
    const targets = uiSelectedCanvasTargets()
    if (!targets.length) return
    const edgeIds = targets.filter((target) => target.kind === 'edge').map((target) => target.id)
    if (edgeIds.length) {
      deleteEdges({ edgeIds })
    }
    const entityIds = targets
      .filter((target) => target.kind !== 'edge')
      .map((target) => target.id)
    if (!entityIds.length) {
      layoutAllViews()
      return
    }
    // Split entity IDs into pages, text entities, file entities, and drawing entities by checking collections
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
  })

  ipcMain.on('canvas-delete-page', (_event, { pageId }: { pageId: string }) => {
    if (!pages.some((candidate) => candidate.id === pageId)) return
    deletePages({ pageIds: [pageId] })
  })

  ipcMain.on('canvas-tidy-selection', () => {
    tidySelectedPages()
  })

  ipcMain.on('canvas-navigate-page', (_event, { pageId, url }: { pageId: string; url: string }) => {
    const page = pages.find((candidate) => candidate.id === pageId)
    if (!page) return
    navigatePage(page, { type: 'load-url', url })
  })

  ipcMain.on('canvas-back-page', (_event, { pageId }: { pageId: string }) => {
    const page = pages.find((candidate) => candidate.id === pageId)
    if (!page) return
    navigatePage(page, { type: 'go-back', fallbackUrl: page.pageView.webContents.getURL() })
  })

  ipcMain.on('canvas-forward-page', (_event, { pageId }: { pageId: string }) => {
    const page = pages.find((candidate) => candidate.id === pageId)
    if (!page) return
    navigatePage(page, { type: 'go-forward', fallbackUrl: page.pageView.webContents.getURL() })
  })

  ipcMain.on('canvas-reload-page', (_event, { pageId }: { pageId: string }) => {
    const page = pages.find((candidate) => candidate.id === pageId)
    if (!page) return
    navigatePage(page, { type: 'reload', fallbackUrl: page.pageView.webContents.getURL() })
  })

  ipcMain.on(
    'canvas-reveal-entity',
    (_event, { entityId, entityKind }: { entityId: string; entityKind: string }) => {
      if (entityKind === 'page') {
        if (!selectPageById(entityId)) return
        focusSelectedPage()
        return
      }
      selectEntity(entityId, entityKind)
      const te = textEntities.find((t) => t.id === entityId)
      const fe = fileEntities.find((f) => f.id === entityId)
      const de = drawingEntities.find((d) => d.id === entityId)
      const se = shapeEntities.find((s) => s.id === entityId)
      const entity = te ?? fe ?? de ?? se
      if (entity) {
        focusCanvasBounds({ x: entity.canvasX, y: entity.canvasY, width: entity.width, height: entity.height })
      }
    },
  )

  ipcMain.on(
    'canvas-delete-entity',
    (_event, { entityId, entityKind }: { entityId: string; entityKind: string }) => {
      if (entityKind === 'text') {
        deleteTextEntity(entityId)
      } else if (entityKind === 'file') {
        deleteFileEntity(entityId)
      } else if (entityKind === 'drawing') {
        deleteDrawingEntity(entityId)
      } else if (entityKind === 'shape') {
        deleteShapeEntity(entityId)
      }
      layoutAllViews()
    },
  )

  ipcMain.on('canvas-reveal-group', (_event, { groupId }: { groupId: string }) => {
    const group = workspaceGroups.find((candidate) => candidate.id === groupId)
    if (!group) return
    selectGroup(groupId)
    focusCanvasBounds({
      x: group.canvasX,
      y: group.canvasY,
      width: group.width,
      height: group.height,
    })
    layoutAllViews()
  })

  ipcMain.on('canvas-ungroup-group', (_event, { groupId }: { groupId: string }) => {
    const group = workspaceGroups.find((g) => g.id === groupId)
    if (!group) return
    selectGroup(groupId)
    ungroupSelectedGroup()
  })

  ipcMain.on(
    'canvas-set-page-preset',
    (_event, { pageId, index }: { pageId: string; index: number }) => {
      if (index < 0 || index >= VIEWPORT_PRESETS.length) return
      const idx = pages.findIndex((candidate) => candidate.id === pageId)
      if (idx === -1) return
      selectPage(idx)
      setPagePreset(pageId, index)
    },
  )

  ipcMain.on('canvas-set-page-custom', (_event, { pageId }: { pageId: string }) => {
    setPageCustom(pageId)
  })

  ipcMain.on(
    'canvas-update-page-bounds',
    (
      _event,
      {
        pageId,
        patch,
      }: {
        pageId: string
        patch: { width?: number; height?: number; canvasX?: number; canvasY?: number }
      },
    ) => {
      const page = pages.find((candidate) => candidate.id === pageId)
      if (!page) return
      const currentSize = pageContentSize(page)
      const nextSize = {
        width: patch.width !== undefined ? snapToGrid(patch.width) : currentSize.width,
        height: patch.height !== undefined ? snapToGrid(patch.height) : currentSize.height,
      }
      const sizeWasResized = patch.width !== undefined || patch.height !== undefined
      const sizeChanged =
        nextSize.width !== currentSize.width || nextSize.height !== currentSize.height
      if (pageUsesCustomSize(page.metadata) || (sizeWasResized && sizeChanged)) {
        let meta = setCustomPageSizeMetadata(page.metadata, nextSize)
        // Resizing away from a device preset clears the device — keeps shell as generic page
        if (sizeChanged && deviceIdFromMetadata(meta)) {
          meta = setDeviceIdMetadata(meta, null)
        }
        page.metadata = meta
      }
      if (patch.canvasX !== undefined) page.canvasX = snapToGrid(patch.canvasX)
      if (patch.canvasY !== undefined) page.canvasY = snapToGrid(patch.canvasY)
      scheduleWorkspaceAutosave()
      markDirty('canvas')
      requestLayout()
    },
  )

  ipcMain.on('canvas-duplicate-page', (_event, { pageId }: { pageId: string }) => {
    if (!pages.some((candidate) => candidate.id === pageId)) return
    duplicatePageFromSource({
      sourcePageId: pageId,
      focus: true,
    })
  })

  ipcMain.on('canvas-toggle-linked-page', (_event, { pageId }: { pageId: string }) => {
    const page = pages.find((candidate) => candidate.id === pageId)
    if (!page) return
    togglePageLinked(page)
    layoutAllViews()
  })

  ipcMain.on('canvas-show-page-context-menu', (_event, { pageId }: { pageId: string }) => {
    const page = pages.find((candidate) => candidate.id === pageId)
    if (!page) return
    const canGoBack = page.pageView.webContents.canGoBack()
    const canGoForward = page.pageView.webContents.canGoForward()
    const menu = Menu.buildFromTemplate([
      {
        label: 'Back',
        enabled: canGoBack,
        click: () => navigatePage(page, { type: 'go-back', fallbackUrl: page.pageView.webContents.getURL() }),
      },
      {
        label: 'Forward',
        enabled: canGoForward,
        click: () => navigatePage(page, { type: 'go-forward', fallbackUrl: page.pageView.webContents.getURL() }),
      },
      {
        label: 'Reload',
        click: () => navigatePage(page, { type: 'reload', fallbackUrl: page.pageView.webContents.getURL() }),
      },
      { type: 'separator' },
      {
        label: 'Duplicate',
        click: () => {
          duplicatePageFromSource({ sourcePageId: pageId, focus: true, skipGrouping: true })
        },
      },
      {
        label: page.linked ? 'Unlink Page' : 'Link Page',
        click: () => {
          togglePageLinked(page)
          layoutAllViews()
        },
      },
      { type: 'separator' },
      {
        label: 'Delete',
        click: () => {
          deletePages({ pageIds: [pageId] })
        },
      },
    ])
    menu.popup()
  })

  ipcMain.on('canvas-reveal-page', (_event, { pageId }: { pageId: string }) => {
    if (!selectPageById(pageId)) return
    focusSelectedPage()
  })

  ipcMain.on('canvas-set-selection-preset', (_event, index: number) => {
    const pageId = selectedPageId()
    if (!pageId) return
    if (index < 0 || index >= VIEWPORT_PRESETS.length) return
    const page = pages.find((candidate) => candidate.id === pageId)
    if (!page) return
    page.presetIndex = index
    scheduleWorkspaceAutosave()
    layoutAllViews()
  })

  ipcMain.on('canvas-open-devtools-selection', () => {
    if (!selectedPageId()) return
    openDevToolsForSelectedPage()
  })

  ipcMain.on('canvas-duplicate-selection', () => {
    const entityIds = getSelectedEntityIds()
    if (!entityIds.length) return
    // For single selection, duplicate the entity (page or text entity)
    if (entityIds.length === 1) {
      duplicateEntity({ entityId: entityIds[0], focus: true })
      return
    }
    const payload = copyableSelectionPayload()
    if (!payload) return
    const bounds = groupBoundsForEntityIds(entityIds)
    if (!bounds) return
    const placement = findDuplicatePlacement(bounds)
    pasteEntitiesFromClipboard({
      payload,
      canvasX: placement.canvasX,
      canvasY: placement.canvasY,
    })
  })

  ipcMain.on('canvas-copy-selection', () => {
    const payload = copyableSelectionPayload()
    if (!payload) return
    clipboard.writeText(`${CLIPBOARD_PREFIX}${JSON.stringify(payload)}`)
  })


  ipcMain.on(
    'canvas-paste-selection',
    (_event, { canvasX, canvasY }: { canvasX: number; canvasY: number }) => {
      // Check for image on clipboard first
      const clipImage = clipboard.readImage()
      if (!clipImage.isEmpty()) {
        const file = saveImageBuffer(clipImage.toPNG(), 'png')
        const { width, height } = clipImage.getSize()
        createFileEntity({ canvasX, canvasY, file, width, height })
        return
      }

      const payload = parseClipboardSelection(clipboard.readText())
      if (!payload) return
      if (payload.version === 2) {
        pasteEntitiesFromClipboard({ payload, canvasX, canvasY })
      } else {
        pastePagesFromClipboard({ payload, canvasX, canvasY })
      }
    },
  )

  ipcMain.on('canvas-toggle-linked-selection', () => {
    const pageIds = getSelectedEntityIds()
    if (!pageIds.length) return
    const selectedPages = pageIds
      .map((pageId) => pages.find((candidate) => candidate.id === pageId))
      .filter((page): page is (typeof pages)[number] => page !== undefined)
    if (!selectedPages.length) return
    const nextLinked = !selectedPages.every((page) => page.linked)
    for (const page of selectedPages) {
      if (page.linked !== nextLinked) {
        togglePageLinked(page)
      }
    }
    layoutAllViews()
  })

  ipcMain.on('canvas-toggle-annotate-mode', () => {
    const next = activeTool().kind === 'comment' ? { kind: 'select' as const } : { kind: 'comment' as const }
    setActiveTool(next)
  })

  ipcMain.on('canvas-toggle-draw-mode', () => {
    if (!DRAWING_FEATURE_ENABLED) return
    const next = activeTool().kind === 'draw' ? { kind: 'select' as const } : { kind: 'draw' as const }
    setActiveTool(next)
  })

  ipcMain.on('canvas-create-annotation', (_event, request: AnnotationCreateRequest) => {
    createAnnotation(request)
  })

  ipcMain.on('canvas-create-drawing', (_event, input: {
    canvasX: number
    canvasY: number
    width: number
    height: number
    strokes: import('../../shared/types').AnnotationDrawingStroke[]
  }) => {
    if (!DRAWING_FEATURE_ENABLED) return
    createDrawingEntityInState(input)
    layoutAllViews()
    scheduleWorkspaceAutosave()
  })

  ipcMain.on(
    'canvas-commit-region-select',
    (_event, canvasRect: { x: number; y: number; width: number; height: number }) => {
      // Forward to annotation overlay to show comment composer.
      setCommentOverlayActive(true)
      setPendingFocus({ kind: 'aboveView' })
      layoutAllViews()
      if (aboveView && !aboveView.webContents.isDestroyed()) {
        aboveView.webContents.send('region-select-committed', { canvasRect })
      }
    },
  )

  ipcMain.on(
    'canvas-create-region-annotation',
    (_event, payload: { canvasRect: { x: number; y: number; width: number; height: number }; text: string }) => {
      executeRegionSelect(payload.canvasRect, payload.text).catch((err) => {
        console.error('[region-select] failed:', err)
      })
    },
  )

  // Comment tool — click below the drag threshold (ADR 0006). Resolve the
  // page under the click; if a DOM element is at the page-local point,
  // route to the existing `annotate-element-selected` flow. Otherwise
  // fall back to a canvas-point anchor, broadcast on a sibling channel.
  ipcMain.on(
    'canvas-comment-click-at',
    (_event, payload: { windowX?: number; windowY?: number } | undefined) => {
      const windowX = payload?.windowX
      const windowY = payload?.windowY
      if (typeof windowX !== 'number' || typeof windowY !== 'number') return

      const fireCanvasPoint = () => {
        const canvasPoint = windowPointToCanvasPoint(windowX, windowY)
        setCommentOverlayActive(true)
        setPendingFocus({ kind: 'aboveView' })
        layoutAllViews()
        if (aboveView && !aboveView.webContents.isDestroyed()) {
          aboveView.webContents.send('comment-canvas-point-committed', {
            canvasX: canvasPoint.x,
            canvasY: canvasPoint.y,
          })
        }
      }

      const hit = pageAtWindowPoint(windowX, windowY)
      if (!hit) {
        fireCanvasPoint()
        return
      }
      queryElementAtPoint(hit.pageId, hit.localX, hit.localY)
        .then((data) => {
          if (data) {
            setCommentOverlayActive(true)
            setPendingFocus({ kind: 'aboveView' })
            layoutAllViews()
            if (aboveView && !aboveView.webContents.isDestroyed()) {
              aboveView.webContents.send('annotate-element-selected', {
                pageId: hit.pageId,
                ...data,
              })
            }
            return
          }
          fireCanvasPoint()
        })
        .catch(() => {
          fireCanvasPoint()
        })
    },
  )

  ipcMain.on(
    'canvas-move-annotation',
    (_event, payload: { annotationId?: string; dx?: number; dy?: number } | undefined) => {
      const annotationId = payload?.annotationId?.trim()
      if (!annotationId) return
      if (typeof payload?.dx !== 'number' || typeof payload?.dy !== 'number') return
      moveAnnotation(annotationId, payload.dx, payload.dy)
    },
  )

  // --- Text Entity IPC ---

  ipcMain.on(
    'canvas-create-text-entity',
    (_event, { canvasX, canvasY, text, color }: { canvasX: number; canvasY: number; text?: string; color?: string }) => {
      createTextEntity({ canvasX, canvasY, text, color })
    },
  )

  ipcMain.on(
    'canvas-update-text-entity',
    (_event, { id, patch }: { id: string; patch: { text?: string; color?: string; width?: number; height?: number; canvasX?: number; canvasY?: number } }) => {
      updateTextEntity(id, patch)
    },
  )

  ipcMain.on('canvas-delete-text-entity', (_event, { id }: { id: string }) => {
    deleteTextEntity(id)
  })

  ipcMain.on(
    'canvas-update-drawing-entity',
    (_event, { id, patch }: { id: string; patch: { width?: number; height?: number; canvasX?: number; canvasY?: number } }) => {
      updateDrawingEntity(id, patch)
    },
  )

  ipcMain.on('canvas-delete-drawing-entity', (_event, { id }: { id: string }) => {
    deleteDrawingEntity(id)
  })

  ipcMain.on('canvas-duplicate-text-entity', (_event, { id }: { id: string }) => {
    duplicateEntity({ entityId: id, focus: true })
  })

  // --- Shape Entity IPC ---

  ipcMain.on(
    'canvas-update-shape',
    (
      _event,
      {
        id,
        patch,
      }: {
        id: string
        patch: Partial<{
          shapeKind: 'rectangle' | 'ellipse' | 'diamond'
          text: string
          color: string
          strokeWidth: number
          theme: string
          width: number
          height: number
          canvasX: number
          canvasY: number
        }>
      },
    ) => {
      updateShapeEntity(id, patch)
    },
  )

  ipcMain.on('canvas-delete-shape', (_event, { id }: { id: string }) => {
    deleteShapeEntity(id)
  })

  // --- File Entity IPC ---

  ipcMain.on(
    'canvas-update-file-entity',
    (_event, { id, patch }: { id: string; patch: { width?: number; height?: number; canvasX?: number; canvasY?: number } }) => {
      updateFileEntity(id, patch)
    },
  )

  ipcMain.on('canvas-delete-file-entity', (_event, { id }: { id: string }) => {
    deleteFileEntity(id)
  })

  ipcMain.on('canvas-duplicate-file-entity', (_event, { id }: { id: string }) => {
    duplicateEntity({ entityId: id, focus: true })
  })

  ipcMain.on('canvas-show-file-in-finder', (_event, { filePath }: { filePath: string }) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('read-note-file', (_event, { filePath }: { filePath: string }) => {
    return readNoteFile(filePath)
  })

  ipcMain.handle('write-note-file', (_event, { filePath, content }: { filePath: string; content: string }) => {
    writeNoteFile(filePath, content)
    return true
  })

  ipcMain.handle('rename-note-file', (_event, { filePath, newName }: { filePath: string; newName: string }) => {
    const newPath = renameNoteFile(filePath, newName)
    if (!newPath) return null
    // Update the file entity's file path
    const entity = fileEntities.find((e) => e.file === filePath)
    if (entity) {
      entity.file = newPath
      scheduleWorkspaceAutosave()
      requestLayout()
    }
    return newPath
  })

  ipcMain.on(
    'canvas-update-group-entity',
    (_event, { id, patch }: { id: string; patch: { width?: number; height?: number; canvasX?: number; canvasY?: number; label?: string; color?: string } }) => {
      updateGroupEntity(id, patch)
    },
  )

  ipcMain.on('canvas-duplicate-group', (_event, { id }: { id: string }) => {
    duplicateGroup({ groupId: id, focus: true })
  })

  ipcMain.on('canvas-delete-group', (_event, { id }: { id: string }) => {
    deleteGroups({ groupIds: [id] })
  })

  ipcMain.on('canvas-group-selection', () => {
    groupSelectedEntities()
  })

  ipcMain.on('canvas-ungroup-selection', () => {
    ungroupSelectedGroup()
  })

  ipcMain.on(
    'canvas-resize-multi-selection',
    (_event, { entries }: { entries: MultiResizeEntry[] }) => {
      resizeMultiSelection(entries)
    },
  )
}
