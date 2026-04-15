import { useEffect, useRef } from 'react'
import type { Annotation } from '../../shared/types'

export function useFocusedAnnotationScroll(
  focusedAnnotationId: string | null | undefined,
  annotations: Annotation[],
) {
  const annotationRefs = useRef<Map<string, HTMLElement>>(new Map())

  useEffect(() => {
    if (!focusedAnnotationId) return
    const element = annotationRefs.current.get(focusedAnnotationId)
    if (!element) return
    const timer = window.setTimeout(() => {
      element.scrollIntoView({ block: 'nearest' })
    }, 40)
    return () => window.clearTimeout(timer)
  }, [focusedAnnotationId, annotations])

  const registerAnnotationElement = (
    annotationId: string,
    element: HTMLElement | null,
  ) => {
    if (element) {
      annotationRefs.current.set(annotationId, element)
      return
    }
    annotationRefs.current.delete(annotationId)
  }

  return {
    registerAnnotationElement,
  }
}
