import { useEffect, useRef, useState } from 'react'
import type { CanvasBgElectronAPI, LayoutUpdateData } from '../../shared/types'

export function useCanvasLayoutState({
  api,
  initialLayoutData,
}: {
  api: CanvasBgElectronAPI
  initialLayoutData: LayoutUpdateData
}) {
  const layoutRef = useRef<LayoutUpdateData>(initialLayoutData)
  const [layoutData, setLayoutData] = useState<LayoutUpdateData>(initialLayoutData)
  const [layoutTick, setLayoutTick] = useState(0)

  useEffect(() => {
    const cleanup = api.onLayoutUpdate((data) => {
      layoutRef.current = data
      setLayoutData(data)
      setLayoutTick((current) => current + 1)
    })
    return cleanup
  }, [api])

  return {
    layoutData,
    layoutRef,
    layoutTick,
  }
}
