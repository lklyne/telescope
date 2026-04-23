import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CanvasBgElectronAPI,
  CanvasSceneEntity,
  CanvasSelectableTarget,
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
import { DRAW_CURSOR, selectionColor } from '../canvas-bg/canvasBgConstants'
import { PlacementPreviewLayer } from '../canvas-bg/CanvasGridSurface'
import { buildPendingPlacementPreview } from '../canvas-bg/canvasBgSelectors'
import { MIN_GROUP_HEIGHT, MIN_GROUP_WIDTH } from '../canvas-bg/entityConstants'
import {
  descendantIdsForGroup,
  selectedGroupHasDescendantFrame,
  selectedGroupDragTargetId,
} from '../canvas-bg/groupMembership'
import { SelectionResizeGrid } from '../canvas-bg/SelectionResizeGrid'
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
const GROUP_DRAG_THRESHOLD = 4

function SelectedGroupResizeOverlay({
  isDark,
  layoutData,
}: {
  isDark: boolean
  layoutData: LayoutUpdateData
}) {
  const selectedGroupId = layoutData.selectedGroupId ?? null
  if (!selectedGroupId) return null
  if (!selectedGroupHasDescendantFrame(layoutData)) return null

  const group = (layoutData.groups ?? []).find((candidate) => candidate.id === selectedGroupId)
  if (!group) return null

  const zoom = group.width > 0 ? group.screenWidth / group.width : 1

  return (
    <div
      className="absolute border-2"
      data-overlay-ui
      style={{
        left: group.screenX,
        top: group.screenY - layoutData.canvasOrigin.y,
        width: group.screenWidth,
        height: group.screenHeight,
        borderColor: selectionColor(isDark),
        borderRadius: 2,
        pointerEvents: 'none',
      }}
    >
      <SelectionResizeGrid
        id={group.id}
        width={group.width}
        height={group.height}
        canvasX={group.canvasX}
        canvasY={group.canvasY}
        zoom={zoom}
        minWidth={MIN_GROUP_WIDTH}
        minHeight={MIN_GROUP_HEIGHT}
        onResize={(id, patch) => api.updateGroupEntity(id, patch)}
        isDark={isDark}
      />
    </div>
  )
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
  useEffect(() => api.onCaptureMode(setCaptureMode), [])

  useEffect(() => api.onSelectionOverlayChanged(setSelectionOverlay), [])

  const isDark = useTheme(initialTheme, api.onThemeChanged)
  useReportTextEditing(api.setTextEditing)

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

  // Above-view covers the canvas when saved drawings are present, so canvas-bg
  // can't see pointermove — above-view owns placement preview here. Seed from
  // the toolbar click that started placement; merged pointer handler below
  // keeps it updated.
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
    (
      startX: number,
      startY: number,
      endX: number,
      endY: number,
      modifiers?: import('../../shared/types').SelectionModifiers,
    ) => {
      const layout = layoutRef.current
      const rect = normalizeRect(startX, startY, endX, endY)
      api.setSelectionOverlayRect(null)
      if (rect.width < 4 || rect.height < 4) {
        api.canvasDeselect(modifiers)
        return
      }
      const windowRect = { ...rect, top: rect.top + layout.canvasOrigin.y }
      api.canvasSelectInRect(screenRectToCanvasRect(windowRect, layout), modifiers)
    },
    [api, layoutRef],
  )

  // Above-view WCV origin sits at canvasOrigin.y; scene entities use screenY
  // in window coords, so we add canvasOrigin.y to clientY before bounds checks.
  const hitTestSceneEntity = useCallback(
    (
      clientX: number,
      clientY: number,
      accept: (entity: CanvasSceneEntity) => boolean,
    ): CanvasSceneEntity | null => {
      const layout = layoutRef.current
      const windowY = clientY + layout.canvasOrigin.y
      const FRAME_CHROME = 44
      for (let i = layout.entities.length - 1; i >= 0; i--) {
        const e = layout.entities[i]
        if (!accept(e)) continue
        const top = e.kind === 'frame' ? e.screenY - FRAME_CHROME : e.screenY
        const bottom = e.screenY + e.screenHeight
        if (
          clientX >= e.screenX &&
          clientX <= e.screenX + e.screenWidth &&
          windowY >= top &&
          windowY <= bottom
        ) {
          return e
        }
      }
      return null
    },
    [layoutRef],
  )

  const hitTestSelectionEntity = useCallback(
    (clientX: number, clientY: number): CanvasSelectableTarget | null => {
      const layout = layoutRef.current
      if (layout.selectedEntityIds.length <= 1) return null

      const entity = hitTestSceneEntity(clientX, clientY, (candidate) => {
        if (candidate.kind === 'group') return false
        return layout.selectedEntityIds.includes(candidate.id)
      })

      return entity ? { id: entity.id, kind: entity.kind } : null
    },
    [hitTestSceneEntity, layoutRef],
  )

  const hitTestSelectedGroupEntity = useCallback(
    (clientX: number, clientY: number): CanvasSelectableTarget | null => {
      const layout = layoutRef.current
      const selectedGroupId = layout.selectedGroupId ?? null
      if (!selectedGroupId) return null

      const group = (layout.groups ?? []).find((candidate) => candidate.id === selectedGroupId)
      if (!group) return null

      const descendantIds = descendantIdsForGroup(layout.groups ?? [], selectedGroupId)
      const descendant = hitTestSceneEntity(clientX, clientY, (candidate) => {
        if (candidate.kind === 'group') return false
        return descendantIds.has(candidate.id)
      })
      if (descendant) return { id: descendant.id, kind: descendant.kind }

      const windowY = clientY + layout.canvasOrigin.y
      const insideBounds =
        clientX >= group.screenX &&
        clientX <= group.screenX + group.screenWidth &&
        windowY >= group.screenY &&
        windowY <= group.screenY + group.screenHeight
      const insideHeader =
        clientX >= group.screenX &&
        clientX <= group.screenX + Math.max(group.screenWidth, 160) &&
        windowY >= group.screenY - 24 &&
        windowY <= group.screenY

      return insideBounds || insideHeader
        ? { id: group.id, kind: 'group' }
        : null
    },
    [hitTestSceneEntity, layoutRef],
  )

  const hitTestPointerEntity = useCallback(
    (clientX: number, clientY: number): CanvasSelectableTarget | null => {
      const selectedGroupTarget = hitTestSelectedGroupEntity(clientX, clientY)
      if (selectedGroupTarget) return selectedGroupTarget

      const preservedSelectionTarget = hitTestSelectionEntity(clientX, clientY)
      if (preservedSelectionTarget) return preservedSelectionTarget

      const frame = hitTestSceneEntity(
        clientX,
        clientY,
        (candidate) => candidate.kind === 'frame',
      )
      return frame ? { id: frame.id, kind: 'frame' } : null
    },
    [hitTestSceneEntity, hitTestSelectedGroupEntity, hitTestSelectionEntity],
  )

  const hitTestHoverTarget = useCallback(
    (clientX: number, clientY: number) => {
      const entity = hitTestSceneEntity(
        clientX,
        clientY,
        (candidate) => candidate.kind !== 'group' && candidate.kind !== 'drawing',
      )
      return entity?.id ?? null
    },
    [hitTestSceneEntity],
  )

  // One window pointermove handler drives both placement-preview cursor and
  // hover forwarding. When above-view intercepts events (gate open), canvas-bg
  // never sees mouseenter/leave, so we dedupe and forward via api.hoverFrame.
  const lastHoverIdRef = useRef<string | null>(null)
  const hoverForwardingEnabled =
    layoutData.annotationMode !== 'draw' && layoutData.annotationMode !== 'region_select'
  useEffect(() => {
    const clearHover = () => {
      if (lastHoverIdRef.current === null) return
      lastHoverIdRef.current = null
      api.hoverFrame(null)
    }
    if (!pendingPlacement && !hoverForwardingEnabled) {
      clearHover()
      return
    }
    const handleMove = (event: PointerEvent) => {
      if (isOverlayUiTarget(event.target)) return
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
          api.hoverFrame(nextId)
        }
      }
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
  }, [api, hitTestHoverTarget, hoverForwardingEnabled, layoutRef, pendingPlacement])

  const onEntityPointerDown = useCallback(
    (target: CanvasSelectableTarget, event: MouseEvent) => {
      const isAdditive = event.shiftKey || event.metaKey || event.ctrlKey
      if (isAdditive) {
        const modifiers = {
          shift: event.shiftKey,
          meta: event.metaKey,
          ctrl: event.ctrlKey,
        }
        if (target.kind === 'frame') api.selectFrame(target.id, modifiers)
        else api.selectEntity(target.id, target.kind, modifiers)
        return
      }

      const layout = layoutRef.current
      const selectedGroupTargetId = selectedGroupDragTargetId(layout, target.id)
      if (selectedGroupTargetId) {
        let dragging = false
        let lastScreenX = event.screenX
        let lastScreenY = event.screenY
        const startScreenX = event.screenX
        const startScreenY = event.screenY

        const selectClickTarget = () => {
          if (target.kind === 'group') {
            api.selectGroup(target.id)
          } else if (target.kind === 'frame') {
            api.selectFrame(target.id)
          } else {
            api.selectEntity(target.id, target.kind)
          }
        }

        const onMove = (ev: MouseEvent) => {
          const totalDx = ev.screenX - startScreenX
          const totalDy = ev.screenY - startScreenY
          if (
            !dragging &&
            Math.abs(totalDx) < GROUP_DRAG_THRESHOLD &&
            Math.abs(totalDy) < GROUP_DRAG_THRESHOLD
          ) {
            return
          }

          if (!dragging) {
            dragging = true
            api.startDragGroup(selectedGroupTargetId)
          }

          const dx = ev.screenX - lastScreenX
          const dy = ev.screenY - lastScreenY
          lastScreenX = ev.screenX
          lastScreenY = ev.screenY
          if (dx !== 0 || dy !== 0) api.dragGroup(selectedGroupTargetId, dx, dy)
        }

        const cleanup = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          window.removeEventListener('blur', onCancel)
        }

        const onUp = () => {
          cleanup()
          if (dragging) {
            api.endDragGroup()
            return
          }
          selectClickTarget()
        }

        const onCancel = () => {
          cleanup()
          if (dragging) api.endDragGroup()
        }

        event.preventDefault()
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        window.addEventListener('blur', onCancel)
        return
      }

      const preserveSelection = layout.selectedEntityIds.includes(target.id)

      if (!preserveSelection) {
        if (target.kind === 'frame') api.selectFrame(target.id)
        else api.selectEntity(target.id, target.kind)
      }

      if (target.kind === 'frame') api.startDragFrame(target.id)
      else api.startDragEntity(target.id)

      let lastScreenX = event.screenX
      let lastScreenY = event.screenY
      const onMove = (ev: MouseEvent) => {
        const dx = ev.screenX - lastScreenX
        const dy = ev.screenY - lastScreenY
        lastScreenX = ev.screenX
        lastScreenY = ev.screenY
        if (dx === 0 && dy === 0) return
        if (target.kind === 'frame') api.dragFrame(target.id, dx, dy)
        else api.dragEntity(target.id, dx, dy)
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        window.removeEventListener('blur', onUp)
        if (target.kind === 'frame') api.endDragFrame()
        else api.endDragEntity()
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      window.addEventListener('blur', onUp)
    },
    [layoutRef],
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
      hitTestEntity:
        overlayInteractive || pendingPlacement || dragMode === 'region_select'
          ? undefined
          : hitTestPointerEntity,
      onEntityPointerDown:
        overlayInteractive || pendingPlacement || dragMode === 'region_select'
          ? undefined
          : onEntityPointerDown,
    }),
    [
      api,
      overlayInteractive,
      pendingPlacement,
      placementClickAt,
      canvasClickAtFromAboveView,
      activeDragMove,
      activeDragEnd,
      dragMode,
      hitTestPointerEntity,
      onEntityPointerDown,
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

          <SelectedGroupResizeOverlay isDark={isDark} layoutData={layoutData} />

          <FloatingUiLayer api={api} isDark={isDark} layoutData={layoutData} />
        </>
      ) : null}
    </div>
  )
}
