import { useEffect } from 'react'
import { isTypingTarget, isPlainShortcutKey } from '../../../shared/gesture-utils'

export function useAnnotationOverlayShortcuts(input: {
  active: boolean
  annotationModeActive: boolean
  drawInteractionEnabled: boolean
  drawingSessionActive: boolean
  clearDraft: () => void
  clearToolMode: () => void
  closeThread: () => void
  deleteSelection: () => void
}) {
  const { active, annotationModeActive, drawInteractionEnabled, drawingSessionActive, clearDraft, clearToolMode, closeThread, deleteSelection } = input

  useEffect(() => {
    if (!active && !drawInteractionEnabled && !annotationModeActive) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (!document.hasFocus()) return
      if (isTypingTarget(event.target)) return

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteSelection()
        return
      }

      if (!isPlainShortcutKey(event, 'escape')) return
      event.preventDefault()
      if (drawingSessionActive) {
        clearDraft()
        return
      }
      if (active) {
        closeThread()
        return
      }
      clearToolMode()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, annotationModeActive, clearDraft, clearToolMode, closeThread, deleteSelection, drawInteractionEnabled, drawingSessionActive])
}
