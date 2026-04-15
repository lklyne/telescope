import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  DevtoolsPanelSelectionSummary,
  InspectNodeDetail,
} from '../../shared/types'
import { rightDetailsPanelApi } from './rightDetailsPanelApi'

export function useElementCommentDraft({
  activeDetail,
  selection,
}: {
  activeDetail?: InspectNodeDetail
  selection?: DevtoolsPanelSelectionSummary
}) {
  const [elementCommentText, setElementCommentText] = useState('')
  const commentInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setElementCommentText('')
  }, [activeDetail?.nodeId])

  const resizeCommentInput = useCallback(() => {
    const input = commentInputRef.current
    if (!input) return
    input.style.height = '0px'
    const nextHeight = Math.min(input.scrollHeight, 120)
    input.style.height = `${nextHeight}px`
    input.style.overflowY = input.scrollHeight > 120 ? 'auto' : 'hidden'
  }, [])

  useEffect(() => {
    resizeCommentInput()
  }, [activeDetail?.nodeId, elementCommentText, resizeCommentInput])

  const submitElementComment = () => {
    if (!activeDetail) return
    const text = elementCommentText.trim()
    if (!text) return
    rightDetailsPanelApi.createAnnotation({
      anchor: {
        type: 'element',
        frameId: activeDetail.frameId,
        selector: activeDetail.fullPath || activeDetail.elementPath,
        elementPath: activeDetail.elementPath,
        boundingBox: activeDetail.boundingBox,
      },
      author: 'user',
      text,
      metadata: {
        frameName: selection?.viewportLabel,
        pageUrl: selection?.url,
        inspectContext: {
          frameId: activeDetail.frameId,
          nodeId: activeDetail.nodeId,
          id: activeDetail.id,
          timestamp: activeDetail.timestamp,
          tagName: activeDetail.tagName,
          name: activeDetail.name,
          role: activeDetail.role,
          elementPath: activeDetail.elementPath,
          fullPath: activeDetail.fullPath,
          cssClasses: activeDetail.cssClasses,
          textPreview: activeDetail.textPreview,
          nearbyText: activeDetail.nearbyText,
          nearbyElements: activeDetail.nearbyElements,
          accessibility: activeDetail.accessibility,
          attributes: activeDetail.attributes,
          computedStyles: activeDetail.computedStyles,
          boundingBox: activeDetail.boundingBox,
          position: activeDetail.position,
          sourceLocation: activeDetail.sourceLocation,
        },
      },
    })
    setElementCommentText('')
  }

  return {
    commentInputRef,
    elementCommentText,
    hasElementComment: elementCommentText.trim().length > 0,
    resizeCommentInput,
    setElementCommentText,
    submitElementComment,
  }
}
