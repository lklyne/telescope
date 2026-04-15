import { useEffect, useRef, useState } from 'react'
import type { InspectPanelState } from '../../shared/types'

export function useInspectTreeState(inspect: InspectPanelState) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const treeRootsKey = inspect.treeRootIds.join(',')

  useEffect(() => {
    const next = new Set<string>()
    for (const id of inspect.treeRootIds.slice(0, 8)) next.add(id)
    setExpanded(next)
  }, [inspect.activeFrameId, treeRootsKey])

  useEffect(() => {
    const selectedNodeId = inspect.selectedNodeId
    if (!selectedNodeId) return
    setExpanded((prev) => {
      const next = new Set(prev)
      let cursor = inspect.nodesById[selectedNodeId]
      while (cursor?.parentId) {
        next.add(cursor.parentId)
        cursor = inspect.nodesById[cursor.parentId]
      }
      return next
    })
  }, [inspect.selectedNodeId, inspect.nodesById])

  useEffect(() => {
    if (!inspect.selectedNodeId) return
    const timer = window.setTimeout(() => {
      const row = rowRefs.current.get(inspect.selectedNodeId ?? '')
      if (!row) return
      row.scrollIntoView({ block: 'nearest' })
    }, 50)
    return () => window.clearTimeout(timer)
  }, [inspect.selectedNodeId, expanded])

  const registerNodeElement = (nodeId: string, element: HTMLButtonElement | null) => {
    if (element) {
      rowRefs.current.set(nodeId, element)
      return
    }
    rowRefs.current.delete(nodeId)
  }

  return {
    expanded,
    setExpanded,
    registerNodeElement,
  }
}
