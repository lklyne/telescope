import { useEffect, useRef } from 'react'
import { rightDetailsPanelApi } from './rightDetailsPanelApi'

/**
 * Keeps the inspect hover highlight in sync with cursor presence over the app.
 *
 * - When the cursor leaves the document, the hover highlight collapses back to
 *   the currently selected node (or clears entirely if nothing is selected).
 * - When selection clears while the cursor is already outside the document,
 *   the hover highlight clears immediately.
 *
 * No-op while no page is active.
 */
export function useClearInspectHoverOnLeave(
  activePageId: string | null,
  selectedNodeId: string | null,
): void {
  const mouseInsideRef = useRef(false)
  useEffect(() => {
    if (!activePageId) return
    const handleDocEnter = () => { mouseInsideRef.current = true }
    const handleDocLeave = () => {
      mouseInsideRef.current = false
      rightDetailsPanelApi.setInspectHoverNode(activePageId, selectedNodeId ?? null)
    }
    // If selection just cleared and mouse is outside, clear hover now
    if (!selectedNodeId && !mouseInsideRef.current) {
      rightDetailsPanelApi.setInspectHoverNode(activePageId, null)
    }
    document.documentElement.addEventListener('pointerenter', handleDocEnter)
    document.documentElement.addEventListener('pointerleave', handleDocLeave)
    return () => {
      document.documentElement.removeEventListener('pointerenter', handleDocEnter)
      document.documentElement.removeEventListener('pointerleave', handleDocLeave)
    }
  }, [activePageId, selectedNodeId])
}
