import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CanvasBgElectronAPI,
  CanvasSceneEntity,
  CanvasSceneDrawingEntity,
  CanvasSceneFileEntity,
  CanvasScenePageEntity,
  CanvasSceneShapeEntity,
  CanvasSceneTextEntity,
  LayoutUpdateData,
  SelectionOverlayPayload,
  ThemeData,
} from '../../shared/types'
import {
  canvasToScreenX,
  canvasToScreenY,
  isOverlayUiTarget,
  normalizeRect,
  screenPointToCanvasPoint,
  screenRectToCanvasRect,
  snapToGrid,
  squareConstrainedRect,
} from '../../shared/gesture-utils'
import { TOOLBAR_HEIGHT } from '../../shared/constants'
import { isAnnotationTool, toolHasPopup } from '../../shared/tool'
import { DRAW_CURSOR } from '../canvas-bg/canvasBgConstants'
import { ActivePageHighlightLayer } from '../canvas-bg/AgentCursorLayer'
import { PlacementPreviewLayer } from '../canvas-bg/CanvasGridSurface'
import { buildPendingPlacementPreview } from '../canvas-bg/canvasBgSelectors'
import { DrawingLayer, SavedDrawingEntities } from './DrawingsLayer'
import { FileBodyLayer, type FileJsonModeMap } from './FileBodyLayer'
import { PageFocusRingLayer } from './PageFocusRingLayer'
import { GroupBoundsLayer } from './GroupBoundsLayer'
import { SelectionOutlineLayer } from './SelectionOutlineLayer'
import { ShapeBodyLayer } from './ShapeBodyLayer'
import { StickyBodyLayer } from './StickyBodyLayer'
import { RegionSelectAnnotations } from './AnnotationsLayer'
import {
  AnnotationThreadPopover,
  PendingCommentComposer,
  RegionSelectComposer,
} from './CommentsLayer'
import { MarqueeLayer } from './MarqueeLayer'
import { useAnnotationDrawingGestures } from './useAnnotationDrawingGestures'
import { useAnnotationDraftState } from './useAnnotationDraftState'
import { useAnnotationThreadState } from './useAnnotationThreadState'
import {
  FULL_ROUTER_CONSUME,
  useCanvasPointerRouter,
} from './useCanvasPointerRouter'
import { EdgeDragLayer } from './EdgeDragLayer'
import { EdgeLayer } from './EdgeLayer'
import { PageChromeOverlay } from './PageChrome'
import { PagePopup } from './PagePopup'
import { FilePopup } from './FilePopup'
import { FileChromeOverlay } from './FileChrome'
import { GroupRenameOverlay } from './GroupRenameLabel'
import { DrawingPopup } from './DrawingPopup'
import { DrawToolPopup } from './DrawToolPopup'
import { GroupPopup } from './GroupPopup'
import { ShapePopup } from './ShapePopup'
import { ShapeToolPopup } from './ShapeToolPopup'
import { StickyNotePopover } from './StickyNotePopover'
import { TextToolPopup } from './TextToolPopup'
import { EDGE_DRAG_IDLE, type EdgeDragState } from '../../shared/edge-drag-controller'
import { useAnnotationOverlayShortcuts } from '../shared/hooks/useAnnotationOverlayShortcuts'
import { useCanvasGlobalShortcuts } from '../shared/hooks/useCanvasGlobalShortcuts'
import { useReportTextEditing } from '../shared/hooks/useReportTextEditing'
import { useTheme } from '../shared/hooks/useTheme'
import { useViewportWheelAndMiddlePan } from '../shared/hooks/useViewportWheelAndMiddlePan'

const api = (window as unknown as { electronAPI: CanvasBgElectronAPI }).electronAPI
const MIN_SHAPE_DRAG_SIZE = 24

/** Map Electron's `cursor-changed` type strings onto CSS cursor values.
 *  Electron uses Blink-era names where `pointer` is the arrow and `hand` is
 *  the link hand — the opposite of CSS. Most other types match CSS 1:1;
 *  panning variants and unknown/custom types collapse to a sensible default. */
function electronCursorToCss(type: string | null): string {
  if (!type || type === 'custom' || type === 'null') return ''
  if (type === 'pointer') return 'default'
  if (type === 'hand') return 'pointer'
  if (type === 'iBeam') return 'text'
  if (type.endsWith('-panning')) return 'all-scroll'
  return type
}

/**
 * Same-kind multi-select detector (ADR 0006 §4). Returns the array of
 * entities iff every selected id resolves to the requested kind; otherwise
 * empty. The caller mounts the popup when length >= 1.
 */
function sameKindSelectedEntities<K extends CanvasSceneEntity['kind']>(
  layout: LayoutUpdateData,
  kind: K,
): Extract<CanvasSceneEntity, { kind: K }>[] {
  const ids = layout.selectedEntityIds
  if (ids.length === 0) return []
  const result: Extract<CanvasSceneEntity, { kind: K }>[] = []
  for (const id of ids) {
    const entity = layout.entities.find((e) => e.id === id)
    if (!entity || entity.kind !== kind) return []
    result.push(entity as Extract<CanvasSceneEntity, { kind: K }>)
  }
  return result
}

function overlayRectFromScreenRect(
  rect: { left: number; top: number; width: number; height: number },
  layout: LayoutUpdateData,
) {
  return {
    ...rect,
    top: rect.top - layout.canvasOrigin.y,
  }
}

export default function App({
  initialLayoutData,
  initialTheme,
}: {
  initialLayoutData: LayoutUpdateData
  initialTheme: ThemeData
}) {
  const layoutRef = useRef<LayoutUpdateData>(initialLayoutData)
  const commentInputRef = useRef<HTMLTextAreaElement>(null)
  const threadInputRef = useRef<HTMLTextAreaElement>(null)
  const activeStrokeRef = useRef<{ pointerId: number; strokeId: string } | null>(null)
  const [layoutData, setLayoutData] = useState<LayoutUpdateData>(initialLayoutData)
  const [fixProgress, setFixProgress] = useState<LayoutUpdateData['fixProgress']>(
    initialLayoutData.fixProgress,
  )
  const [selectionOverlay, setSelectionOverlay] = useState<SelectionOverlayPayload | null>(null)
  const [captureMode, setCaptureMode] = useState(false)
  const [fileJsonModeMap, setFileJsonModeMap] = useState<FileJsonModeMap>(() => new Map())
  const setFileJsonMode = useCallback((entityId: string, jsonMode: boolean) => {
    setFileJsonModeMap((prev) => {
      const next = new Map(prev)
      if (jsonMode) next.set(entityId, true)
      else next.delete(entityId)
      return next
    })
  }, [])
  useEffect(() => api.onCaptureMode(setCaptureMode), [])

  useEffect(() => api.onSelectionOverlayChanged(setSelectionOverlay), [])

  // Marquee preview ids — outline layer highlights entities that the in-flight
  // marquee currently overlaps. canvas-bg used to derive this; aboveView owns
  // the marquee gesture, so we derive locally from `selectionOverlay`.
  //
  // Selection-popup mounts on single OR same-kind multi-select (ADR 0006 §4).
  // Each `selectedXxxEntities` is the non-empty array of selected entities iff
  // every selected id resolves to that kind; otherwise empty.
  const selectedTextEntities = useMemo<CanvasSceneTextEntity[]>(() => {
    return sameKindSelectedEntities(layoutData, 'text')
  }, [layoutData.selectedEntityIds, layoutData.entities])
  const selectedGroupEntity = useMemo(() => {
    if (!layoutData.selectedGroupId) return null
    return (layoutData.groups ?? []).find((g) => g.id === layoutData.selectedGroupId) ?? null
  }, [layoutData.groups, layoutData.selectedGroupId])
  const selectedShapeEntities = useMemo<CanvasSceneShapeEntity[]>(() => {
    return sameKindSelectedEntities(layoutData, 'shape')
  }, [layoutData.selectedEntityIds, layoutData.entities])
  const selectedDrawingEntities = useMemo<CanvasSceneDrawingEntity[]>(() => {
    return sameKindSelectedEntities(layoutData, 'drawing')
  }, [layoutData.selectedEntityIds, layoutData.entities])
  const selectedPageEntities = useMemo<CanvasScenePageEntity[]>(() => {
    return sameKindSelectedEntities(layoutData, 'page')
  }, [layoutData.selectedEntityIds, layoutData.entities])
  const selectedFileEntities = useMemo<CanvasSceneFileEntity[]>(() => {
    return sameKindSelectedEntities(layoutData, 'file')
  }, [layoutData.selectedEntityIds, layoutData.entities])
  const selectedEntityIdSet = useMemo(
    () => new Set(layoutData.selectedEntityIds),
    [layoutData.selectedEntityIds],
  )
  const interactionIdle = layoutData.interaction.kind === 'idle'

  // Single source of truth for "is anything currently in inline-edit mode?"
  // Derived from the broadcast interaction state — no separate ping channel.
  const editingEntityId =
    layoutData.interaction.kind === 'editing-entity'
      ? layoutData.interaction.entityId
      : null

  const marqueePreviewIds = useMemo(() => {
    if (
      !selectionOverlay ||
      selectionOverlay.variant !== 'default' ||
      !selectionOverlay.entityIds?.length
    ) {
      return null
    }
    return new Set(selectionOverlay.entityIds)
  }, [selectionOverlay])

  const isDark = useTheme(initialTheme, api.onThemeChanged)
  useReportTextEditing(api.setTextEditing)
  useCanvasGlobalShortcuts({ api, layoutRef })

  useEffect(() => {
    const cleanup = api.onLayoutUpdate((data) => {
      layoutRef.current = data
      setLayoutData(data)
      setFixProgress(data.fixProgress)
    })
    return cleanup
  }, [])

  useEffect(() => api.onFixProgressUpdate(setFixProgress), [])

  const {
    clearDraft,
    commentText,
    drawingSession,
    drawingStrokeActive,
    pendingAnnotation,
    pendingRegionRect,
    resizeCommentInput,
    setCommentText,
    setDrawingSession,
    setDrawingStrokeActive,
    setPendingAnnotation,
    submitPendingAnnotation,
    submitRegionAnnotation,
  } = useAnnotationDraftState({
    api,
    layoutData,
    layoutRef,
    commentInputRef,
    activeStrokeRef,
  })
  const {
    closeThread,
    openThread,
    openThreadById,
    openThreadId,
    openThreadMenu,
    replyText,
    setOpenThreadMenu,
    setReplyText,
    submitThreadReply,
    threadPosition,
  } = useAnnotationThreadState({
    api,
    layoutData,
    threadInputRef,
  })
  const drawInteractionEnabled = layoutData.activeTool.kind === 'draw' && !openThreadId
  const selectedEdgeIds = useMemo(() => {
    const ids = new Set<string>()
    for (const target of layoutData.selection) {
      if (target.kind === 'edge') ids.add(target.id)
    }
    return ids
  }, [layoutData.selection])
  const hoveredEntityId = layoutData.hover?.id ?? null
  const overlayInteractive = Boolean(
    pendingAnnotation ||
      pendingRegionRect ||
      openThreadId ||
      drawingSession ||
      layoutData.activeTool.kind === 'draw',
  )
  // Gate authority is main (Phase 5d-v2 D6): shouldGateBeOpen() derives
  // bounds from interaction, toolMode, modifiers, presence, marquee,
  // floating menu, and saved drawings. Main can't see renderer-local
  // state — pending composers, open thread popovers, in-flight
  // drawings — so we sync exactly those through setCommentOverlayActive.
  useEffect(() => {
    api.setCommentOverlayActive(overlayInteractive)
    return () => {
      api.setCommentOverlayActive(false)
    }
  }, [overlayInteractive])
  // Above-view is the sole owner of the placement preview ghost. The cursor
  // starts null and is set by the first pointermove (handled below); we don't
  // seed from main, because polling the OS cursor at layout time risks
  // capturing toolbar coordinates and re-snapping the ghost on every layout
  // broadcast.
  const pendingPlacement = layoutData.pendingPlacement
  const [placementCursor, setPlacementCursor] = useState<{
    clientX: number
    clientY: number
  } | null>(null)
  useEffect(() => {
    if (!pendingPlacement) setPlacementCursor(null)
  }, [pendingPlacement])
  const placementPreview = useMemo(
    () => buildPendingPlacementPreview(layoutData, placementCursor),
    [layoutData, placementCursor],
  )

  const {
    consumeSuppressedAnnotationClick,
    handleOverlayPointerCancel,
    handleOverlayPointerDown,
    handleOverlayPointerMove,
    handleOverlayPointerUp,
    startAnnotationDrag,
  } = useAnnotationDrawingGestures({
    api,
    clearDraft,
    closeThread,
    drawInteractionEnabled,
    layoutData,
    layoutRef,
    pendingAnnotation,
    activeStrokeRef,
    setDrawingSession,
    setDrawingStrokeActive,
    setPendingAnnotation,
  })

  useAnnotationOverlayShortcuts({
    active: Boolean(pendingAnnotation || pendingRegionRect || drawingSession || openThreadId),
    annotationModeActive: isAnnotationTool(layoutData.activeTool),
    drawInteractionEnabled,
    drawingSessionActive: Boolean(pendingAnnotation || pendingRegionRect || drawingSession),
    clearDraft,
    clearToolMode: () => api.setTool({ kind: 'select' }),
    closeThread,
    deleteSelection: api.deleteSelection,
  })

  const onDragMove = useCallback(
    (startX: number, startY: number, endX: number, endY: number) => {
      const layout = layoutRef.current
      const rect = normalizeRect(startX, startY, endX, endY)
      // Annotation overlay sits at canvasOrigin.y, but the interaction overlay
      // (where the selection box renders) sits at TOOLBAR_HEIGHT. Offset the
      // rect so it aligns with the mouse in both canvas and browser modes.
      api.setSelectionOverlayRect({
        rect: {
          ...rect,
          top: rect.top + (layout.canvasOrigin.y - TOOLBAR_HEIGHT),
        },
        variant: 'region-select',
      })
    },
    [api, layoutRef],
  )

  const onDragEnd = useCallback(
    (startX: number, startY: number, endX: number, endY: number) => {
      const layout = layoutRef.current
      const rect = normalizeRect(startX, startY, endX, endY)
      api.setSelectionOverlayRect(null)
      if (rect.width < 4 || rect.height < 4) return
      // Overlay clientY is relative to the overlay top (canvasOrigin.y),
      // but clientX is already window-relative (overlay starts at x=0).
      const windowRect = {
        ...rect,
        top: rect.top + layout.canvasOrigin.y,
      }
      api.commitRegionSelect(screenRectToCanvasRect(windowRect, layout))
    },
    [api, layoutRef],
  )

  const hitTestHoverTarget = useCallback(
    (clientX: number, clientY: number) => {
      const layout = layoutRef.current
      const windowY = clientY + layout.canvasOrigin.y
      for (let i = layout.entities.length - 1; i >= 0; i--) {
        const entity = layout.entities[i]
        if (entity.kind === 'group' || entity.kind === 'drawing') continue
        if (
          clientX >= entity.screenX &&
          clientX <= entity.screenX + entity.screenWidth &&
          windowY >= entity.screenY &&
          windowY <= entity.screenY + entity.screenHeight
        ) {
          return entity.id
        }
      }
      return null
    },
    [layoutRef],
  )

  // One window pointermove handler drives both placement-preview cursor and
  // hover forwarding. When above-view intercepts events (gate open), canvas-bg
  // never sees mouseenter/leave, so we dedupe and forward via api.hoverPage.
  const lastHoverIdRef = useRef<string | null>(null)
  const hoverForwardingEnabled =
    layoutData.activeTool.kind !== 'draw' && layoutData.activeTool.kind !== 'region-select'
  useEffect(() => {
    const clearHover = () => {
      setPlacementCursor(null)
      if (lastHoverIdRef.current === null) return
      lastHoverIdRef.current = null
      api.hoverPage(null)
    }
    if (!pendingPlacement && !hoverForwardingEnabled) {
      clearHover()
      return
    }
    const handleMove = (event: PointerEvent) => {
      if (isOverlayUiTarget(event.target)) {
        clearHover()
        return
      }
      if (pendingPlacement) {
        setPlacementCursor({
          clientX: event.clientX,
          clientY: event.clientY + layoutRef.current.canvasOrigin.y,
        })
      }
      if (hoverForwardingEnabled) {
        const nextId = hitTestHoverTarget(event.clientX, event.clientY)
        if (nextId !== lastHoverIdRef.current) {
          lastHoverIdRef.current = nextId
          api.hoverPage(nextId)
        }
      }
    }
    // The top toolbar is a sibling WebContentsView, so when the cursor moves
    // up into it the above-view stops receiving pointer events without
    // window.pointerleave firing. mouseleave on documentElement is the
    // reliable "cursor left this webcontents" signal.
    const docEl = document.documentElement
    window.addEventListener('pointermove', handleMove)
    docEl.addEventListener('mouseleave', clearHover)
    window.addEventListener('blur', clearHover)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      docEl.removeEventListener('mouseleave', clearHover)
      window.removeEventListener('blur', clearHover)
      clearHover()
    }
  }, [api, hitTestHoverTarget, hoverForwardingEnabled, layoutRef, pendingPlacement])

  const routerOwnsCanvasPointers =
    !overlayInteractive &&
    !pendingPlacement &&
    !isAnnotationTool(layoutData.activeTool)
  const toolGestureOwnsCanvasPointers =
    !overlayInteractive &&
    (Boolean(pendingPlacement) || layoutData.activeTool.kind === 'region-select')

  useEffect(() => {
    if (overlayInteractive) return
    if (!pendingPlacement && layoutData.activeTool.kind !== 'region-select') return

    const onPointerDown = (event: PointerEvent) => {
      if (isOverlayUiTarget(event.target)) return
      if (event.button !== 0) return
      const layout = layoutRef.current
      if (layout.viewMode !== 'canvas') return
      if (!layout.pendingPlacement && layout.activeTool.kind !== 'region-select') return

      event.preventDefault()
      event.stopPropagation()

      const pointerId = event.pointerId
      const target = event.target instanceof Element ? event.target : null
      try {
        target?.setPointerCapture(pointerId)
      } catch {
        /* ignore */
      }

      const startX = event.clientX
      const startY = event.clientY
      const startWindowY = startY + layout.canvasOrigin.y
      const startCanvas = screenPointToCanvasPoint(startX, startWindowY, layout)
      const placementAtStart = layout.pendingPlacement

      const cleanup = () => {
        try {
          if (target?.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
        } catch {
          /* ignore */
        }
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        window.removeEventListener('blur', onCancel)
      }

      const updateShapePreview = (ev: PointerEvent) => {
        const current = layoutRef.current
        const endCanvas = screenPointToCanvasPoint(
          ev.clientX,
          ev.clientY + current.canvasOrigin.y,
          current,
        )
        const square = squareConstrainedRect(
          startCanvas.x,
          startCanvas.y,
          endCanvas.x,
          endCanvas.y,
          ev.shiftKey,
        )
        const minCanvasX = snapToGrid(square.left)
        const minCanvasY = snapToGrid(square.top)
        const snappedW = snapToGrid(square.width)
        const snappedH = snapToGrid(square.height)
        const screenRect = {
          left: canvasToScreenX(current, minCanvasX),
          top: canvasToScreenY(current, minCanvasY),
          width: snappedW * current.zoom,
          height: snappedH * current.zoom,
        }
        api.setSelectionOverlayRect({
          rect: overlayRectFromScreenRect(screenRect, current),
          variant: 'place-shape',
          shapeKind: current.pendingPlacement?.shapeKind ?? 'rectangle',
        })
      }

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return
        const current = layoutRef.current
        if (placementAtStart?.entityKind === 'shape') {
          updateShapePreview(ev)
          return
        }
        if (!placementAtStart && current.activeTool.kind === 'region-select') {
          onDragMove(startX, startY, ev.clientX, ev.clientY)
        }
      }

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return
        cleanup()
        const current = layoutRef.current
        if (placementAtStart) {
          if (placementAtStart.entityKind === 'shape') {
            api.setSelectionOverlayRect(null)
            const endCanvas = screenPointToCanvasPoint(
              ev.clientX,
              ev.clientY + current.canvasOrigin.y,
              current,
            )
            const square = squareConstrainedRect(
              startCanvas.x,
              startCanvas.y,
              endCanvas.x,
              endCanvas.y,
              ev.shiftKey,
            )
            if (square.width >= MIN_SHAPE_DRAG_SIZE && square.height >= MIN_SHAPE_DRAG_SIZE) {
              api.placePendingShape(snapToGrid(square.left), snapToGrid(square.top), {
                x: snapToGrid(square.left),
                y: snapToGrid(square.top),
                width: snapToGrid(square.width),
                height: snapToGrid(square.height),
              })
            } else {
              api.placePendingShape(snapToGrid(startCanvas.x), snapToGrid(startCanvas.y), null)
            }
            return
          }
          api.placePendingEntity(snapToGrid(startCanvas.x), snapToGrid(startCanvas.y))
          return
        }
        if (current.activeTool.kind === 'region-select') {
          onDragEnd(startX, startY, ev.clientX, ev.clientY)
        }
      }

      const onCancel = () => {
        cleanup()
        api.setSelectionOverlayRect(null)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
      window.addEventListener('blur', onCancel)
    }

    window.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, {
        capture: true,
      } as EventListenerOptions)
    }
  }, [api, layoutData.activeTool.kind, layoutRef, onDragEnd, onDragMove, overlayInteractive, pendingPlacement])

  const viewportWheelAndPanApi = useMemo(
    () => ({
      canvasZoom: api.canvasZoom,
      canvasPan: api.canvasPan,
    }),
    [],
  )
  // Pre-route wheel events that hit the single-selected page's body into
  // that page's page. Cmd/Ctrl+wheel is already classified as 'zoom' by
  // useViewportWheelAndMiddlePan and stays on the canvas. Wheel during a
  // drag/marquee/edge gesture also stays with the canvas — forwarding it
  // would scroll the page underneath an in-flight gesture.
  const routeWheel = useCallback(
    (event: WheelEvent): boolean => {
      const layout = layoutRef.current
      if (layout.viewMode !== 'canvas') return false
      if (layout.interaction.kind !== 'idle') return false
      const selected = layout.selectedEntityIds
      if (selected.length !== 1) return false
      const pageId = selected[0]
      const page = layout.entities.find(
        (entity): entity is CanvasSceneEntity & { kind: 'page' } =>
          entity.kind === 'page' && entity.id === pageId,
      )
      if (!page) return false
      const windowY = event.clientY + layout.canvasOrigin.y
      const x0 = page.contentScreenX ?? page.screenX
      const y0 = page.contentScreenY ?? page.screenY
      const x1 = x0 + (page.contentScreenWidth ?? page.screenWidth)
      const y1 = y0 + (page.contentScreenHeight ?? page.screenHeight)
      if (event.clientX < x0 || event.clientX > x1) return false
      if (windowY < y0 || windowY > y1) return false
      api.forwardWheelToPage(pageId, {
        windowX: event.clientX,
        windowY,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        // DOM_DELTA_PIXEL on macOS trackpads → precise; line/page mode → ticks.
        hasPreciseScrollingDeltas: event.deltaMode === 0,
        // Cmd/Ctrl+wheel is intercepted by classifyViewportWheel as 'zoom'
        // and never reaches us, so 'pan' here always scrolls.
        canScroll: true,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      })
      return true
    },
    [layoutRef],
  )
  useViewportWheelAndMiddlePan(true, viewportWheelAndPanApi, routeWheel)

  // PoC: mirror the focused page's `cursor-changed` onto aboveView's body so
  // the OS shows the right cursor (hand on links, I-beam on text, etc.). The
  // OS picks cursor from the topmost WCV at the pointer location, which is
  // aboveView whenever the canvas-mode gate is open.
  useEffect(() => {
    return api.onPageCursorChange(({ type }) => {
      document.body.style.cursor = electronCursorToCss(type)
    })
  }, [])

  // PoC: continuous hover forwarding into the single-selected page's body so
  // cursor styling (link → hand, text → I-beam) and hover-driven UI react
  // without requiring a button-down. The router's `runForwardPointer` already
  // forwards moves while a button is held, so this listener only fires when
  // no buttons are pressed to avoid double-dispatch. When the pointer leaves
  // the focused page's body (or selection drops below one page), reset
  // body cursor so the hand/I-beam doesn't bleed into canvas chrome.
  useEffect(() => {
    let cursorIsForwarded = false
    const resetCursor = () => {
      if (!cursorIsForwarded) return
      cursorIsForwarded = false
      document.body.style.cursor = ''
    }
    const onMove = (event: PointerEvent) => {
      if (event.buttons !== 0) return
      const layout = layoutRef.current
      if (layout.viewMode !== 'canvas') return resetCursor()
      const selected = layout.selectedEntityIds
      if (selected.length !== 1) return resetCursor()
      const pageId = selected[0]
      const page = layout.entities.find(
        (entity): entity is CanvasSceneEntity & { kind: 'page' } =>
          entity.kind === 'page' && entity.id === pageId,
      )
      if (!page) return resetCursor()
      const windowY = event.clientY + layout.canvasOrigin.y
      const x0 = page.contentScreenX ?? page.screenX
      const y0 = page.contentScreenY ?? page.screenY
      const x1 = x0 + (page.contentScreenWidth ?? page.screenWidth)
      const y1 = y0 + (page.contentScreenHeight ?? page.screenHeight)
      if (event.clientX < x0 || event.clientX > x1) return resetCursor()
      if (windowY < y0 || windowY > y1) return resetCursor()
      cursorIsForwarded = true
      api.forwardPointerToPage(pageId, {
        kind: 'move',
        windowX: event.clientX,
        windowY,
        button: 'left',
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      })
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      resetCursor()
    }
  }, [layoutRef])

  // ADR 0001 — canvas pointer router. Single window-level pointerdown
  // listener that runs the shared hit-test, classifies the action via the
  // priority table, and dispatches every gesture (focus, drag, resize,
  // edge-drag, marquee, pan) through the existing IPC surface. The
  // `EdgeDragLayer` below renders the rubber-band line driven by the same
  // controller state.
  const spaceHeldRef = useRef(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent, down: boolean) => {
      if (event.code === 'Space') spaceHeldRef.current = down
    }
    const onDown = (e: KeyboardEvent) => onKey(e, true)
    const onUp = (e: KeyboardEvent) => onKey(e, false)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])
  const [edgeDragState, setEdgeDragState] = useState<EdgeDragState>(EDGE_DRAG_IDLE)
  useCanvasPointerRouter({
    api,
    layoutRef,
    enabled: routerOwnsCanvasPointers,
    consume: FULL_ROUTER_CONSUME,
    spaceHeldRef,
    setEdgeDragState,
  })

  useEffect(() => {
    if (!pendingAnnotation) return
    closeThread()
  }, [closeThread, pendingAnnotation])

  useEffect(() => {
    if (!openThreadId) return
    activeStrokeRef.current = null
    clearDraft()
  }, [clearDraft, openThreadId])

  useEffect(() => {
    if (!drawInteractionEnabled) return
    // Force the pen cursor across every element while in draw mode — some
    // children (drawing hit-paths, thread chrome, region annotations) set
    // their own cursor and would otherwise win on hover.
    const style = document.createElement('style')
    style.textContent = `html, body, body * { cursor: ${DRAW_CURSOR} !important; }`
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, [drawInteractionEnabled])

  return (
    <div
      className={`relative h-screen w-screen overflow-hidden bg-transparent ${
        overlayInteractive || routerOwnsCanvasPointers || toolGestureOwnsCanvasPointers
          ? 'pointer-events-auto'
          : 'pointer-events-none'
      }`}
      style={{
        cursor: drawInteractionEnabled ? DRAW_CURSOR : undefined,
      }}
      onPointerDown={handleOverlayPointerDown}
      onPointerMove={handleOverlayPointerMove}
      onPointerUp={handleOverlayPointerUp}
      onPointerCancel={handleOverlayPointerCancel}
    >
      <SavedDrawingEntities
        entities={layoutData.entities}
        layoutData={layoutData}
        selectedEntityIds={layoutData.selectedEntityIds}
      />

      {placementPreview && selectionOverlay?.variant !== 'place-shape' ? (
        <PlacementPreviewLayer
          isDark={isDark}
          preview={{
            ...placementPreview,
            top: placementPreview.top - layoutData.canvasOrigin.y,
          }}
        />
      ) : null}

      {selectionOverlay?.variant === 'place-shape' &&
      selectionOverlay.rect.width > 0 &&
      selectionOverlay.rect.height > 0 ? (
        <PlacementPreviewLayer
          isDark={isDark}
          preview={{
            entityKind: 'shape',
            shapeKind: selectionOverlay.shapeKind,
            left: selectionOverlay.rect.left,
            top: selectionOverlay.rect.top,
            width: selectionOverlay.rect.width,
            height: selectionOverlay.rect.height,
          }}
        />
      ) : null}

      {!captureMode ? (
        <>
          {layoutData.activeTool.kind === 'region-select' ? (
            <RegionSelectAnnotations
              annotations={layoutData.annotations}
              interactive={!selectionOverlay && !pendingRegionRect}
              layoutData={layoutData}
              onOpenThread={openThreadById}
            />
          ) : null}

          {drawingSession ? <DrawingLayer drawing={{ version: 1, ...drawingSession }} layout={layoutData} active /> : null}

          <PendingCommentComposer
            clearDraft={clearDraft}
            commentInputRef={commentInputRef}
            commentText={commentText}
            pendingAnnotation={pendingAnnotation}
            resizeCommentInput={resizeCommentInput}
            setCommentText={setCommentText}
            submitPendingAnnotation={submitPendingAnnotation}
          />

          {pendingRegionRect ? (
            <RegionSelectComposer
              canvasRect={pendingRegionRect}
              clearDraft={clearDraft}
              commentInputRef={commentInputRef}
              commentText={commentText}
              layoutData={layoutData}
              resizeCommentInput={resizeCommentInput}
              setCommentText={setCommentText}
              submitRegionAnnotation={submitRegionAnnotation}
            />
          ) : null}

        </>
      ) : null}

      {!captureMode ? (
        <>
          <AnnotationThreadPopover
            api={api}
            closeThread={closeThread}
            drawCursor={DRAW_CURSOR}
            drawInteractionEnabled={drawInteractionEnabled}
            openThread={openThread}
            openThreadMenu={openThreadMenu}
            progress={openThread ? fixProgress[openThread.id] : undefined}
            replyText={replyText}
            setOpenThreadMenu={setOpenThreadMenu}
            setReplyText={setReplyText}
            startAnnotationDrag={startAnnotationDrag}
            submitThreadReply={submitThreadReply}
            threadInputRef={threadInputRef}
            threadPosition={threadPosition}
          />

          <MarqueeLayer overlay={selectionOverlay} />

          {layoutData.viewMode === 'canvas' && layoutData.presenceCursors.length > 0 ? (
            <ActivePageHighlightLayer
              cursors={layoutData.presenceCursors}
              pages={layoutData.entities.filter(
                (e): e is CanvasScenePageEntity => e.kind === 'page',
              )}
              originY={layoutData.canvasOrigin.y}
            />
          ) : null}

          {layoutData.viewMode === 'canvas' ? (
            <EdgeLayer
              edges={layoutData.edges}
              entities={layoutData.entities}
              hoveredEntityId={hoveredEntityId}
              isDark={isDark}
              interaction={layoutData.interaction}
              selectedEdgeIds={selectedEdgeIds}
              selectedEntityIds={layoutData.selectedEntityIds}
              zoom={layoutData.zoom}
              originY={layoutData.canvasOrigin.y}
              onSelectEdge={api.selectEdge}
            />
          ) : null}

          {layoutData.viewMode === 'canvas' && (layoutData.groups?.length ?? 0) > 0 ? (
            <GroupBoundsLayer
              groups={layoutData.groups ?? []}
              isDark={isDark}
              zoom={layoutData.zoom}
              canvasOrigin={layoutData.canvasOrigin}
              pan={layoutData.pan}
            />
          ) : null}

          {layoutData.viewMode === 'canvas' ? (
            <ShapeBodyLayer
              entities={layoutData.entities.filter(
                (e): e is CanvasSceneShapeEntity => e.kind === 'shape',
              )}
              isDark={isDark}
              selectedEntityIdSet={selectedEntityIdSet}
              editingEntityId={editingEntityId}
              canvasOrigin={layoutData.canvasOrigin}
              pan={layoutData.pan}
              zoom={layoutData.zoom}
              onUpdateText={(id, text) => api.updateShapeEntity(id, { text })}
              onCommitEdit={api.commitEntityEdit}
            />
          ) : null}

          {layoutData.viewMode === 'canvas' ? (
            <StickyBodyLayer
              entities={layoutData.entities.filter(
                (e): e is CanvasSceneTextEntity => e.kind === 'text',
              )}
              isDark={isDark}
              selectedEntityIdSet={selectedEntityIdSet}
              editingEntityId={editingEntityId}
              canvasOrigin={layoutData.canvasOrigin}
              pan={layoutData.pan}
              zoom={layoutData.zoom}
              onUpdateText={(id, text) => api.updateTextEntity(id, { text })}
              onUpdateSize={(id, width, height) =>
                api.updateTextEntity(id, { width, height })
              }
              onCommitEdit={api.commitEntityEdit}
            />
          ) : null}

          {layoutData.viewMode === 'canvas' ? (
            <FileBodyLayer
              entities={layoutData.entities.filter(
                (e): e is CanvasSceneFileEntity => e.kind === 'file',
              )}
              isDark={isDark}
              selectedEntityIdSet={selectedEntityIdSet}
              editingEntityId={editingEntityId}
              jsonModeMap={fileJsonModeMap}
              canvasOrigin={layoutData.canvasOrigin}
              pan={layoutData.pan}
              zoom={layoutData.zoom}
              onTextEditingChange={api.setTextEditing}
            />
          ) : null}

          {layoutData.viewMode === 'canvas' ? (
            <PageFocusRingLayer
              pages={layoutData.entities.filter(
                (e): e is CanvasScenePageEntity => e.kind === 'page',
              )}
              fileEntities={layoutData.entities.filter(
                (e): e is CanvasSceneFileEntity => e.kind === 'file',
              )}
              focusedPageId={layoutData.keyboardTargetPageId}
              originY={layoutData.canvasOrigin.y}
            />
          ) : null}

          {layoutData.viewMode === 'canvas' ? (
            <SelectionOutlineLayer
              layoutData={layoutData}
              isDark={isDark}
              marqueePreviewIds={marqueePreviewIds}
            />
          ) : null}

          <EdgeDragLayer state={edgeDragState} layoutData={layoutData} isDark={isDark} />

          <PageChromeOverlay api={api} layoutData={layoutData} isDark={isDark} />
          <FileChromeOverlay api={api} layoutData={layoutData} isDark={isDark} />
          <GroupRenameOverlay
            api={api}
            layoutData={layoutData}
            isDark={isDark}
            editingEntityId={editingEntityId}
          />

          {layoutData.viewMode === 'canvas' ? (
            <>
              {/* Tool-mode popups (ADR 0006 §2 mutex: tool wins when active). */}
              {layoutData.activeTool.kind === 'add-text' ? (
                <TextToolPopup
                  api={api}
                  isDark={isDark}
                  layout={layoutData}
                  style={layoutData.activeTool.style}
                />
              ) : null}
              {layoutData.activeTool.kind === 'add-shape' ? (
                <ShapeToolPopup api={api} isDark={isDark} layout={layoutData} />
              ) : null}
              {layoutData.activeTool.kind === 'draw' ? (
                <DrawToolPopup api={api} isDark={isDark} layout={layoutData} />
              ) : null}

              {/* Selection-mode popups — suppressed while any tool with its own
                  popup is active (ADR 0006 §2). */}
              {!toolHasPopup(layoutData.activeTool) ? (
                <>
                  <StickyNotePopover
                    api={api}
                    isDark={isDark}
                    layout={layoutData}
                    selectedTextEntities={selectedTextEntities}
                    interactionIdle={interactionIdle}
                  />
                  <GroupPopup
                    api={api}
                    isDark={isDark}
                    layout={layoutData}
                    selectedGroup={selectedGroupEntity}
                    interactionIdle={interactionIdle}
                  />
                  <ShapePopup
                    api={api}
                    isDark={isDark}
                    layout={layoutData}
                    selectedShapes={selectedShapeEntities}
                    interactionIdle={interactionIdle}
                  />
                  <DrawingPopup
                    api={api}
                    isDark={isDark}
                    layout={layoutData}
                    selectedDrawings={selectedDrawingEntities}
                    interactionIdle={interactionIdle}
                  />
                  <PagePopup
                    api={api}
                    isDark={isDark}
                    layout={layoutData}
                    selectedPages={selectedPageEntities}
                    interactionIdle={interactionIdle}
                  />
                  <FilePopup
                    api={api}
                    isDark={isDark}
                    layout={layoutData}
                    selectedFiles={selectedFileEntities}
                    interactionIdle={interactionIdle}
                    fileJsonModeMap={fileJsonModeMap}
                    setFileJsonMode={setFileJsonMode}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
