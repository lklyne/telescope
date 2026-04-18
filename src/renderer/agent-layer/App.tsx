import { useEffect, useState } from 'react'
import type {
  CanvasBgElectronAPI,
  LayoutUpdateData,
} from '../../shared/types'
import { AgentCursorLayer } from '../canvas-bg/AgentCursorLayer'

const api = (window as unknown as { electronAPI: CanvasBgElectronAPI }).electronAPI

export default function App({
  initialLayoutData,
}: {
  initialLayoutData: LayoutUpdateData
}) {
  const [layoutData, setLayoutData] = useState<LayoutUpdateData>(initialLayoutData)

  useEffect(() => api.onLayoutUpdate(setLayoutData), [])

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-transparent">
      <AgentCursorLayer frames={layoutData.narrationFrames} />
    </div>
  )
}
