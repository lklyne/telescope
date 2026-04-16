import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CanvasBgElectronAPI,
  LayoutUpdateData,
  SelectionOverlayPayload,
  ThemeData,
} from '../../shared/types'
import {
  isOverlayUiTarget,
  normalizeRect,
  screenPointToCanvasPoint,
  screenRectToCanvasRect,
  snapToGrid,
} from '../../shared/gesture-utils'
import { TOOLBAR_HEIGHT } from '../../shared/constants'
import { DRAW_CURSOR } from '../canvas-bg/canvasBgConstants'
import { PlacementPreviewLayer } from '../canvas-bg/CanvasGridSurface'
import { buildPendingPlacementPreview } from '../canvas-bg/canvasBgSelectors'
import { DrawingLayer, SavedDrawingEntities } from './DrawingsLayer'
import { RegionSelectAnnotations } from './AnnotationsLayer'
import {
  AnnotationThreadPopover,
  PendingCommentComposer,
  RegionSelectComposer,
} from './CommentsLayer'
import { MarqueeLayer } from './MarqueeLayer'
import { FloatingUiLayer, hasFloatingMenu } from './FloatingUiLayer'
import { useAnnotationDrawingGestures } from './useAnnotationDrawingGestures'
import { useAnnotationDraftState } from './useAnnotationDraftState'
import { useAnnotationThreadState } from './useAnnotationThreadState'
import { useAnnotationOverlayShortcuts } from '../shared/hooks/useAnnotationOverlayShortcuts'
import { useReportTextEditing } from '../shared/hooks/useReportTextEditing'
import { useTheme } from '../shared/hooks/useTheme'
import { useViewportForwarding } from '../shared/hooks/useViewportForwarding'

const api = (window as unknown as { electronAPI: CanvasBgElectronAPI }).electronAPI

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
  const [selectionOverlay, setSelectionOverlay] = useState<SelectionOverlayPayload | null>(null)
  const [captureMode, setCaptureMode] = useState(false)
  useEffect(() => api.onCaptureMode(setCaptureMode), [])

  useEffect(() => api.onSelectionOverlayChanged(setSelectionOverlay), [])

  const isDark = useTheme(initialTheme, api.onThemeChanged)
  useReportTextEditing(api.setTextEditing)

  useEffect(() => {
    const cleanup = api.onLayoutUpdate((data) => {
      layoutRef.current = data
      setLayoutData(data)
    })
    return cleanup
  }, [])

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
  const drawInteractionEnabled = layoutData.annotationMode === 'draw' && !openThreadId
  const overlayInteractive = Boolean(
    pendingAnnotation ||
      pendingRegionRect ||
      openThreadId ||
      drawingSession ||
      layoutData.annotationMode === 'draw',
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
  const hasSelectedFrame = layoutData.entities.some(
    (e) => e.kind === 'frame' && layoutData.selectedEntityIds.includes(e.id),
  )
  const hasSavedDrawings =
    !hasSelectedFrame && layoutData.entities.some((e) => e.kind === 'drawing')

  // Above-view owns placement preview whenever its gate is open (saved
  // drawings force us to cover the canvas, so canvas-bg can't see the
  // pointer). Tracks cursor from window pointermove and commits on click.
  // Above-view's pointer events are relative to its origin at canvasOrigin.y,
  // so we add that offset to get the window-relative coords that
  // buildPendingPlacementPreview expects.
  const pendingPlacement = layoutData.pendingPlacement
  const [placementCursor, setPlacementCursor] = useState<{
    clientX: number
    clientY: number
  } | null>(null)
  useEffect(() => {
    if (!pendingPlacement) {
      setPlacementCursor(null)
      return
    }
    if (
      pendingPlacement.initialClientX !== null &&
      pendingPlacement.initialClientY !== null
    ) {
      setPlacementCursor({
        clientX: pendingPlacement.initialClientX,
        clientY: pendingPlacement.initialClientY,
      })
    }
  }, [pendingPlacement])
  useEffect(() => {
    if (!pendingPlacement) return
    const handlePointerMove = (event: PointerEvent) => {
      if (isOverlayUiTarget(event.target)) return
      setPlacementCursor({
        clientX: event.clientX,
        clientY: event.clientY + layoutRef.current.canvasOrigin.y,
      })
    }
    window.addEventListener('pointermove', handlePointerMove)
    return () => window.removeEventListener('pointermove', handlePointerMove)
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
    annotationModeActive: layoutData.annotationMode !== 'off',
    drawInteractionEnabled,
    drawingSessionActive: Boolean(pendingAnnotation || pendingRegionRect || drawingSession),
    clearDraft,
    clearToolMode: api.clearToolMode,
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

  const onMarqueeMove = useCallback(
    (startX: number, startY: number, endX: number, endY: number) => {
      const layout = layoutRef.current
      const rect = normalizeRect(startX, startY, endX, endY)
      api.setSelectionOverlayRect({
        rect: {
          ...rect,
          top: rect.top + (layout.canvasOrigin.y - TOOLBAR_HEIGHT),
        },
        variant: 'default',
      })
    },
    [api, layoutRef],
  )

  const onMarqueeEnd = useCallback(
    (startX: number, startY: number, endX: number, endY: number) => {
      const layout = layoutRef.current
      const rect = normalizeRect(startX, startY, endX, endY)
      api.setSelectionOverlayRect(null)
      if (rect.width < 4 || rect.height < 4) {
        api.canvasDeselect()
        return
      }
      const windowRect = { ...rect, top: rect.top + layout.canvasOrigin.y }
      api.canvasSelectInRect(screenRectToCanvasRect(windowRect, layout))
    },
    [api, layoutRef],
  )

  const hitTestFrame = useCallback(
    (clientX: number, clientY: number): string | null => {
      const layout = layoutRef.current
      // Above-view WCV origin is at canvasOrigin.y; scene entities use
      // screenY in window coords, so add canvasOrigin.y to clientY.
      const windowY = clientY + layout.canvasOrigin.y
      const FRAME_CHROME = 44
      for (let i = layout.entities.length - 1; i >= 0; i--) {
        const e = layout.entities[i]
        if (e.kind !== 'frame') continue
        const top = e.screenY - FRAME_CHROME
        const bottom = e.screenY + e.screenHeight
        if (
          clientX >= e.screenX &&
          clientX <= e.screenX + e.screenWidth &&
          windowY >= top &&
          windowY <= bottom
        ) {
          return e.id
        }
      }
      return null
    },
    [layoutRef],
  )

  // Hover hit-test over any interactive entity kind. Above-view intercepts
  // pointer events whenever the gate is open (e.g. saved drawings present),
  // so canvas-bg's chrome-level mouseenter/leave never fires — we forward
  // hover changes through api.hoverFrame.
  const hitTestHoverTarget = useCallback(
    (clientX: number, clientY: number): string | null => {
      const layout = layoutRef.current
      const windowY = clientY + layout.canvasOrigin.y
      const FRAME_CHROME = 44
      for (let i = layout.entities.length - 1; i >= 0; i--) {
        const e = layout.entities[i]
        if (e.kind === 'group' || e.kind === 'drawing') continue
        const top = e.kind === 'frame' ? e.screenY - FRAME_CHROME : e.screenY
        const bottom = e.screenY + e.screenHeight
        if (
          clientX >= e.screenX &&
          clientX <= e.screenX + e.screenWidth &&
          windowY >= top &&
          windowY <= bottom
        ) {
          return e.id
        }
      }
      return null
    },
    [layoutRef],
  )
  const lastHoverIdRef = useRef<string | null>(null)
  const hoverForwardingEnabled = layoutData.annotationMode !== 'draw'
  useEffect(() => {
    const clearHover = () => {
      if (lastHoverIdRef.current === null) return
      lastHoverIdRef.current = null
      api.hoverFrame(null)
    }
    if (!hoverForwardingEnabled) {
      clearHover()
      return
    }
    const handleMove = (event: PointerEvent) => {
      if (isOverlayUiTarget(event.target)) return
      const nextId = hitTestHoverTarget(event.clientX, event.clientY)
      if (nextId === lastHoverIdRef.current) return
      lastHoverIdRef.current = nextId
      api.hoverFrame(nextId)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerleave', clearHover)
    window.addEventListener('blur', clearHover)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerleave', clearHover)
      window.removeEventListener('blur', clearHover)
      clearHover()
    }
  }, [hitTestHoverTarget, hoverForwardingEnabled])

  const onFramePointerDown = useCallback(
    (frameId: string, event: MouseEvent) => {
      api.selectFrame(frameId)
      api.startDragFrame(frameId)
      let lastScreenX = event.screenX
      let lastScreenY = event.screenY
      const onMove = (ev: MouseEvent) => {
        const dx = ev.screenX - lastScreenX
        const dy = ev.screenY - lastScreenY
        lastScreenX = ev.screenX
        lastScreenY = ev.screenY
        if (dx !== 0 || dy !== 0) api.dragFrame(frameId, dx, dy)
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        window.removeEventListener('blur', onUp)
        api.endDragFrame()
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      window.addEventListener('blur', onUp)
    },
    [],
  )

  const placementClickAt = useCallback(
    (screenX: number, screenY: number) => {
      const layout = layoutRef.current
      const point = screenPointToCanvasPoint(
        screenX,
        screenY + layout.canvasOrigin.y,
        layout,
      )
      api.placePendingEntity(snapToGrid(point.x), snapToGrid(point.y))
    },
    [],
  )

  // Above-view's pointer events are relative to its origin (canvasOrigin.y
  // below the toolbar), but main's canvas-click-at expects window-relative
  // coords — adjust Y before forwarding.
  const canvasClickAtFromAboveView = useCallback(
    (screenX: number, screenY: number) => {
      api.canvasClickAt(screenX, screenY + layoutRef.current.canvasOrigin.y)
    },
    [],
  )

  const dragMode: 'region_select' | 'marquee' | null =
    !overlayInteractive && !pendingPlacement
      ? layoutData.annotationMode === 'region_select'
        ? 'region_select'
        : hasSavedDrawings
          ? 'marquee'
          : null
      : null
  const activeDragMove =
    dragMode === 'region_select' ? onDragMove : dragMode === 'marquee' ? onMarqueeMove : undefined
  const activeDragEnd =
    dragMode === 'region_select' ? onDragEnd : dragMode === 'marquee' ? onMarqueeEnd : undefined
  const viewportForwardingApi = useMemo(
    () => ({
      canvasZoom: api.canvasZoom,
      canvasPan: api.canvasPan,
      canvasDeselect: overlayInteractive || pendingPlacement ? undefined : api.canvasDeselect,
      canvasClickAt: overlayInteractive
        ? undefined
        : pendingPlacement
          ? placementClickAt
          : canvasClickAtFromAboveView,
      onDragMove: activeDragMove,
      onDragEnd: activeDragEnd,
      hitTestFrame: overlayInteractive || pendingPlacement ? undefined : hitTestFrame,
      onFramePointerDown:
        overlayInteractive || pendingPlacement ? undefined : onFramePointerDown,
    }),
    [
      api,
      overlayInteractive,
      pendingPlacement,
      placementClickAt,
      canvasClickAtFromAboveView,
      activeDragMove,
      activeDragEnd,
      hitTestFrame,
      onFramePointerDown,
    ],
  )
  // Always enabled: when the overlay has zero bounds (main's gate closed),
  // the renderer DOM receives no events, so listener attachment is a no-op.
  useViewportForwarding(true, viewportForwardingApi)

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
        overlayInteractive ? 'pointer-events-auto' : 'pointer-events-none'
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
        onSelect={
          layoutData.annotationMode === 'off' && layoutData.pendingPlacement === null
            ? (id) => api.selectEntity(id, 'drawing')
            : undefined
        }
      />

      {placementPreview ? (
        <PlacementPreviewLayer
          isDark={isDark}
          preview={{
            ...placementPreview,
            top: placementPreview.top - layoutData.canvasOrigin.y,
          }}
        />
      ) : null}

      {!captureMode ? (
        <>
          {layoutData.annotationMode === 'region_select' ? (
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
            replyText={replyText}
            setOpenThreadMenu={setOpenThreadMenu}
            setReplyText={setReplyText}
            startAnnotationDrag={startAnnotationDrag}
            submitThreadReply={submitThreadReply}
            threadInputRef={threadInputRef}
            threadPosition={threadPosition}
          />

          <MarqueeLayer overlay={selectionOverlay} />

          <FloatingUiLayer api={api} isDark={isDark} layoutData={layoutData} />
        </>
      ) : null}
    </div>
  )
}
