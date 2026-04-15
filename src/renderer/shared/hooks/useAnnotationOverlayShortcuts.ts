import { useEffect } from 'react'
import { isTypingTarget, isPlainShortcutKey } from '../../../shared/gesture-utils'

export function useAnnotationOverlayShortcuts(input: {
  active: boolean
  drawInteractionEnabled: boolean
  drawingSessionActive: boolean
  clearDraft: () => void
  clearToolMode: () => void
  closeThread: () => void
  deleteSelection: () => void
}) {
  const { active, drawInteractionEnabled, drawingSessionActive, clearDraft, clearToolMode, closeThread, deleteSelection } = input

  useEffect(() => {
    if (!active && !drawInteractionEnabled) return

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
        clearToolMode()
        return
      }
      closeThread()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, clearDraft, clearToolMode, closeThread, deleteSelection, drawInteractionEnabled, drawingSessionActive])
}
