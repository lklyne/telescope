import { useEffect } from 'react'
import { isPlainShortcutKey, isTypingTarget } from '../../../shared/gesture-utils'
import type { Tool } from '../../../shared/types'

export function useAnnotateToggleShortcut(input: {
  setTool: (tool: Tool) => void
  activeTool: Tool
  drawingEnabled?: boolean
}) {
  const { setTool, activeTool, drawingEnabled } = input
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!document.hasFocus()) return
      if (isTypingTarget(event.target)) return
      if (isPlainShortcutKey(event, 'v')) {
        event.preventDefault()
        setTool({ kind: 'select' })
        return
      }
      if (isPlainShortcutKey(event, 'c')) {
        event.preventDefault()
        setTool(activeTool.kind === 'comment' ? { kind: 'select' } : { kind: 'comment' })
        return
      }
      if (drawingEnabled && isPlainShortcutKey(event, 'd')) {
        event.preventDefault()
        setTool(activeTool.kind === 'draw' ? { kind: 'select' } : { kind: 'draw' })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setTool, activeTool, drawingEnabled])
}
