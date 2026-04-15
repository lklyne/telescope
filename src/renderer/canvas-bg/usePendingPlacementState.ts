import { useEffect, useMemo, useState } from 'react'
import type { LayoutUpdateData } from '../../shared/types'
import { buildPendingPlacementPreview } from './canvasBgSelectors'

export function usePendingPlacementState(layoutData: LayoutUpdateData) {
  const [placementCursor, setPlacementCursor] = useState<{
    clientX: number
    clientY: number
  } | null>(null)

  useEffect(() => {
    if (!layoutData.pendingPlacement) {
      setPlacementCursor(null)
      return
    }
    if (
      placementCursor === null &&
      layoutData.pendingPlacement.initialClientX !== null &&
      layoutData.pendingPlacement.initialClientY !== null &&
      layoutData.pendingPlacement.initialClientY >= layoutData.canvasOrigin.y
    ) {
      setPlacementCursor({
        clientX: layoutData.pendingPlacement.initialClientX,
        clientY: layoutData.pendingPlacement.initialClientY,
      })
    }
  }, [layoutData.canvasOrigin.y, layoutData.pendingPlacement, placementCursor])

  const pendingPlacementPreview = useMemo(
    () => buildPendingPlacementPreview(layoutData, placementCursor),
    [layoutData, placementCursor],
  )

  return {
    pendingPlacementPreview,
    placementCursor,
    setPlacementCursor,
  }
}
