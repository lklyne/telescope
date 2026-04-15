import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CanvasBgElectronAPI, LayoutUpdateData } from '../../shared/types'
import { annotationScreenPos } from './annotationMath'

const VIEWPORT_PADDING = 8
const THREAD_CARD_WIDTH = 360
const THREAD_CARD_MIN_HEIGHT = 220

export function useAnnotationThreadState({
  api,
  layoutData,
  threadInputRef,
}: {
  api: CanvasBgElectronAPI
  layoutData: LayoutUpdateData
  threadInputRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const [openThreadId, setOpenThreadId] = useState<string | null>(null)
  const [openThreadMenu, setOpenThreadMenu] = useState(false)
  const [replyText, setReplyText] = useState('')

  const closeThread = useCallback(() => {
    setOpenThreadId(null)
    setOpenThreadMenu(false)
    setReplyText('')
  }, [])

  const openThread = useMemo(
    () =>
      openThreadId
        ? (layoutData.annotations ?? []).find((annotation) => annotation.id === openThreadId) ??
          null
        : null,
    [layoutData.annotations, openThreadId],
  )

  useEffect(() => {
    const cleanup = api.onAnnotationThreadOpen(({ annotationId }) => {
      if (!annotationId) return
      setOpenThreadId(annotationId)
      setReplyText('')
    })
    return cleanup
  }, [api])

  useEffect(() => {
    if (!openThreadId) return
    const id = window.requestAnimationFrame(() => {
      threadInputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(id)
  }, [openThreadId, threadInputRef])

  useEffect(() => {
    if (!openThreadId) return
    if (openThread) return
    closeThread()
  }, [closeThread, openThread, openThreadId])

  useEffect(() => {
    if (!openThreadId) {
      setOpenThreadMenu(false)
    }
  }, [openThreadId])

  const submitThreadReply = useCallback(() => {
    if (!openThreadId) return
    const next = replyText.trim()
    if (!next) return
    api.addAnnotationReply(openThreadId, next)
    setReplyText('')
  }, [api, openThreadId, replyText])

  const threadPosition = useMemo(() => {
    if (!openThread) return null
    const anchorPos = annotationScreenPos(openThread, layoutData)
    if (!anchorPos) return null
    const belowY = anchorPos.y + 18
    const aboveY = anchorPos.y - THREAD_CARD_MIN_HEIGHT - 12
    const top =
      belowY + THREAD_CARD_MIN_HEIGHT <= window.innerHeight - VIEWPORT_PADDING
        ? belowY
        : Math.max(VIEWPORT_PADDING, aboveY)
    const isRegion = openThread.anchor.type === 'region'
    const rawLeft = isRegion
      ? anchorPos.x - THREAD_CARD_WIDTH / 2
      : anchorPos.x - THREAD_CARD_WIDTH + 12
    const left = Math.max(
      VIEWPORT_PADDING,
      Math.min(rawLeft, window.innerWidth - THREAD_CARD_WIDTH - VIEWPORT_PADDING),
    )
    return { left, top, width: THREAD_CARD_WIDTH }
  }, [layoutData, openThread])

  const openThreadById = useCallback((annotationId: string) => {
    setOpenThreadId(annotationId)
    setOpenThreadMenu(false)
    setReplyText('')
  }, [])

  return {
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
  }
}
