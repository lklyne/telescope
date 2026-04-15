import { useEffect } from 'react'
import { isPlainShortcutKey, isTypingTarget } from '../../../shared/gesture-utils'

export function useAnnotateToggleShortcut(input: {
  toggleAnnotateMode: () => void
  toggleDrawMode?: () => void
  clearToolMode?: () => void
}) {
  const { toggleAnnotateMode, toggleDrawMode, clearToolMode } = input
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!document.hasFocus()) return
      if (isTypingTarget(event.target)) return
      if (clearToolMode && isPlainShortcutKey(event, 'v')) {
        event.preventDefault()
        clearToolMode()
        return
      }
      if (isPlainShortcutKey(event, 'c')) {
        event.preventDefault()
        toggleAnnotateMode()
        return
      }
      if (toggleDrawMode && isPlainShortcutKey(event, 'd')) {
        event.preventDefault()
        toggleDrawMode()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearToolMode, toggleAnnotateMode, toggleDrawMode])
}
