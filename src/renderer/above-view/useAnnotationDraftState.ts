import { useCallback, useEffect, useState } from 'react'
import type {
  AnnotationAnchor,
  AnnotationElementSelectionPayload,
  CanvasBgElectronAPI,
  LayoutUpdateData,
  WorkspaceBounds,
} from '../../shared/types'
import { toOverlayY } from '../../shared/gesture-utils'
import {
  drawingBounds,
  type DrawingSession,
  type PendingAnnotation,
} from './annotationMath'

const VIEWPORT_PADDING = 8
const COMPOSER_MARGIN = 8
const COMPOSER_MIN_HEIGHT = 52

export function useAnnotationDraftState({
  api,
  layoutData,
  layoutRef,
  commentInputRef,
  activeStrokeRef,
}: {
  api: CanvasBgElectronAPI
  layoutData: LayoutUpdateData
  layoutRef: React.MutableRefObject<LayoutUpdateData>
  commentInputRef: React.RefObject<HTMLTextAreaElement | null>
  activeStrokeRef: React.MutableRefObject<{ pointerId: number; strokeId: string } | null>
}) {
  const [pendingAnnotation, setPendingAnnotation] = useState<PendingAnnotation | null>(null)
  const [pendingRegionRect, setPendingRegionRect] = useState<WorkspaceBounds | null>(null)
  const [drawingSession, setDrawingSession] = useState<DrawingSession | null>(null)
  const [drawingStrokeActive, setDrawingStrokeActive] = useState(false)
  const [commentText, setCommentText] = useState('')

  const resizeCommentInput = useCallback(() => {
    const input = commentInputRef.current
    if (!input) return
    input.style.height = '0px'
    const nextHeight = Math.min(input.scrollHeight, 120)
    input.style.height = `${nextHeight}px`
    input.style.overflowY = input.scrollHeight > 120 ? 'auto' : 'hidden'
  }, [commentInputRef])

  const clearDraft = useCallback(() => {
    activeStrokeRef.current = null
    setPendingAnnotation(null)
    setPendingRegionRect(null)
    setDrawingSession(null)
    setDrawingStrokeActive(false)
    setCommentText('')
  }, [activeStrokeRef])

  const submitPendingAnnotation = useCallback(() => {
    if (!pendingAnnotation) return
    const nextText = commentText.trim()
    if (!nextText) return
    api.createAnnotation({
      ...pendingAnnotation.request,
      text: nextText,
    })
    clearDraft()
  }, [api, clearDraft, commentText, pendingAnnotation])

  const submitRegionAnnotation = useCallback(() => {
    if (!pendingRegionRect) return
    const nextText = commentText.trim()
    if (!nextText) return
    api.createRegionAnnotation(pendingRegionRect, nextText)
    clearDraft()
  }, [api, clearDraft, commentText, pendingRegionRect])

  const submitDrawing = useCallback(() => {
    if (!drawingSession || !drawingSession.strokes.length) return
    api.createDrawing({
      canvasX: drawingSession.bounds.x,
      canvasY: drawingSession.bounds.y,
      width: drawingSession.bounds.width,
      height: drawingSession.bounds.height,
      strokes: drawingSession.strokes,
    })
    clearDraft()
  }, [api, clearDraft, drawingSession])

  const undoLastStroke = useCallback(() => {
    setDrawingSession((current) => {
      if (!current || current.strokes.length === 0) return null
      const nextStrokes = current.strokes.slice(0, -1)
      if (!nextStrokes.length) return null
      return {
        strokes: nextStrokes,
        bounds: drawingBounds(nextStrokes),
      }
    })
  }, [])

  useEffect(() => {
    const cleanup = api.onAnnotateElementSelected((payload) => {
      const pending = buildPendingAnnotation(payload, layoutRef.current)
      if (!pending) return
      setPendingAnnotation(pending)
      setDrawingSession(null)
      setCommentText('')
    })
    return cleanup
  }, [api, layoutRef])

  useEffect(() => {
    const cleanup = api.onRegionSelectCommitted(({ canvasRect }) => {
      setPendingRegionRect(canvasRect)
      setPendingAnnotation(null)
      setDrawingSession(null)
      setCommentText('')
    })
    return cleanup
  }, [api])

  useEffect(() => {
    if (layoutData.annotationMode === 'comment') {
      if (drawingSession) {
        activeStrokeRef.current = null
        setDrawingSession(null)
        setCommentText('')
      }
      return
    }
    if (layoutData.annotationMode === 'region_select') {
      // Keep pendingRegionRect intact during region_select mode.
      if (drawingSession) {
        activeStrokeRef.current = null
        setDrawingSession(null)
        setCommentText('')
      }
      return
    }
    if (pendingAnnotation) {
      setPendingAnnotation(null)
      setCommentText('')
    }
    if (pendingRegionRect) {
      setPendingRegionRect(null)
      setCommentText('')
    }
  }, [activeStrokeRef, drawingSession, layoutData.annotationMode, pendingAnnotation])

  useEffect(() => {
    if (layoutData.annotationMode === 'draw') return
    if (!drawingSession) return
    // Auto-submit drawing when leaving draw mode
    if (drawingSession.strokes.length > 0) {
      api.createDrawing({
        canvasX: drawingSession.bounds.x,
        canvasY: drawingSession.bounds.y,
        width: drawingSession.bounds.width,
        height: drawingSession.bounds.height,
        strokes: drawingSession.strokes,
      })
    }
    clearDraft()
  }, [api, clearDraft, drawingSession, layoutData.annotationMode])

  useEffect(() => {
    resizeCommentInput()
  }, [commentText, drawingSession, pendingAnnotation, resizeCommentInput])

  useEffect(() => {
    if (!pendingAnnotation && !pendingRegionRect) return
    const id = window.requestAnimationFrame(() => {
      commentInputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(id)
  }, [commentInputRef, pendingAnnotation, pendingRegionRect])

  return {
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
    submitDrawing,
    submitPendingAnnotation,
    submitRegionAnnotation,
    undoLastStroke,
  }
}

function buildPendingAnnotation(
  payload: AnnotationElementSelectionPayload,
  layout: LayoutUpdateData,
): PendingAnnotation | null {
  const frame = layout.entities.find((candidate) => candidate.id === payload.frameId)
  if (!frame) return null
  const bb = payload.boundingBox
  const contentScreenX =
    'contentScreenX' in frame && frame.contentScreenX != null ? frame.contentScreenX : frame.screenX
  const contentScreenY =
    'contentScreenY' in frame && frame.contentScreenY != null ? frame.contentScreenY : frame.screenY
  const contentScreenWidth =
    'contentScreenWidth' in frame && frame.contentScreenWidth != null
      ? frame.contentScreenWidth
      : frame.screenWidth
  const contentScreenHeight =
    'contentScreenHeight' in frame && frame.contentScreenHeight != null
      ? frame.contentScreenHeight
      : frame.screenHeight
  const scaleX = contentScreenWidth / frame.width
  const scaleY = contentScreenHeight / frame.height
  const elementLeft = contentScreenX + (bb ? bb.x * scaleX : contentScreenWidth / 2)
  const elementTop = toOverlayY(
    layout,
    contentScreenY + (bb ? bb.y * scaleY : contentScreenHeight / 2),
  )
  const elementHeight = bb ? bb.height * scaleY : 0
  // Anchor composer to outer shell bounds (device frame when present) so it clears
  // the chrome with a consistent gap regardless of whether the frame is toggled on.
  const frameBottomOverlay = toOverlayY(layout, frame.screenY + frame.screenHeight)
  const frameTopOverlay = toOverlayY(layout, frame.screenY)
  const elementBottom = Math.max(elementTop + elementHeight, frameBottomOverlay)
  const elementTopAnchor = Math.min(elementTop, frameTopOverlay)
  const composerWidth = Math.min(420, window.innerWidth - VIEWPORT_PADDING * 2)
  const composerX = Math.min(
    Math.max(elementLeft, VIEWPORT_PADDING),
    window.innerWidth - composerWidth - VIEWPORT_PADDING,
  )
  const canRenderBelow =
    elementBottom + COMPOSER_MARGIN + COMPOSER_MIN_HEIGHT <=
    window.innerHeight - VIEWPORT_PADDING
  const belowY = elementBottom + COMPOSER_MARGIN
  const aboveY = elementTopAnchor - COMPOSER_MARGIN - COMPOSER_MIN_HEIGHT
  const composerY = canRenderBelow ? belowY : Math.max(VIEWPORT_PADDING, aboveY)
  const anchor: AnnotationAnchor = {
    type: 'element',
    frameId: payload.frameId,
    selector: payload.elementPath,
    elementPath: payload.fullPath,
    boundingBox: payload.boundingBox,
  }
  return {
    request: {
      anchor,
      text: '',
      kind: 'comment',
      metadata: {
        inspectContext: payload,
      },
    },
    composerX,
    composerY,
    composerWidth,
  }
}
