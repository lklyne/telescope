import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { CanvasBgElectronAPI, LayoutUpdateData } from '../../../shared/types'
import {
  isPlainShortcutKey,
  isTypingTarget,
  screenPointToCanvasPoint,
  snapToGrid,
} from '../../../shared/gesture-utils'

export function useCanvasGlobalShortcuts(input: {
  api: CanvasBgElectronAPI
  layoutRef: RefObject<LayoutUpdateData>
  chromeDraggingRef: RefObject<boolean>
  syncChromeDragCopyMode: (copyMode: boolean) => void
}) {
  const { api, layoutRef, chromeDraggingRef, syncChromeDragCopyMode } = input

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!document.hasFocus()) return
      if (chromeDraggingRef.current && event.key === 'Alt') {
        syncChromeDragCopyMode(true)
      }
      if (isTypingTarget(event.target)) return

      const layout = layoutRef.current

      if (isPlainShortcutKey(event, 'escape') && layout.pendingPlacement) {
        event.preventDefault()
        api.cancelPendingPlacement()
        return
      }

      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        layout.selection.length
      ) {
        event.preventDefault()
        api.deleteSelectedEntities()
        return
      }

      if (!layout.selectedEntityIds.length) return

      if (isPlainShortcutKey(event, 't')) {
        event.preventDefault()
        // Kept as a shortcut-only action for now; the canvas UI no longer exposes tidy,
        // but this remains useful if we bring that workflow back later.
        api.tidySelectedEntities()
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!document.hasFocus()) return
      if (chromeDraggingRef.current && event.key === 'Alt') {
        syncChromeDragCopyMode(false)
      }
    }

    // Canvas entity copy/cut/paste — bound to DOM clipboard events so that:
    // (1) native copy/paste in inputs/textareas/contenteditable is untouched;
    // (2) text selections inside non-editable rendered content (e.g. markdown
    //     preview) are copied natively; and
    // (3) when focus is on the bare canvas with entities selected, we take
    //     over the clipboard and copy/paste entities instead.
    const shouldHijackClipboard = (event: ClipboardEvent): boolean => {
      if (isTypingTarget(event.target)) return false
      const sel = window.getSelection()
      if (sel && sel.toString().length > 0) return false
      return layoutRef.current.viewMode === 'canvas'
    }

    const handleCopy = (event: ClipboardEvent) => {
      if (!shouldHijackClipboard(event)) return
      if (!layoutRef.current.selectedEntityIds.length) return
      event.preventDefault()
      api.copySelection()
    }

    const handleCut = (event: ClipboardEvent) => {
      if (!shouldHijackClipboard(event)) return
      const layout = layoutRef.current
      if (!layout.selection.length) return
      event.preventDefault()
      if (layout.selectedEntityIds.length) api.copySelection()
      api.deleteSelectedEntities()
    }

    const handlePaste = (event: ClipboardEvent) => {
      if (!shouldHijackClipboard(event)) return
      const layout = layoutRef.current
      const rightInset = layout.devtoolsOpen ? layout.devtoolsWidth : 0
      const leftInset = layout.leftChromeWidth
      const centerX = leftInset + (window.innerWidth - rightInset - leftInset) / 2
      const centerY =
        layout.canvasOrigin.y + (window.innerHeight - layout.canvasOrigin.y) / 2
      const point = screenPointToCanvasPoint(centerX, centerY, layout)
      event.preventDefault()
      api.pasteSelection(snapToGrid(point.x), snapToGrid(point.y))
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    document.addEventListener('copy', handleCopy)
    document.addEventListener('cut', handleCut)
    document.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      document.removeEventListener('copy', handleCopy)
      document.removeEventListener('cut', handleCut)
      document.removeEventListener('paste', handlePaste)
    }
  }, [api, chromeDraggingRef, layoutRef, syncChromeDragCopyMode])
}
