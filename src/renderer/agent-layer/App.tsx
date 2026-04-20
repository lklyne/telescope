import { useEffect, useState } from 'react'
import type {
  CanvasBgElectronAPI,
  CanvasSceneFrameEntity,
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

  const clipTop = layoutData.canvasOrigin.y
  const clipLeft = layoutData.leftChromeWidth
  const clipRight = layoutData.devtoolsOpen ? layoutData.devtoolsWidth : 0

  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden bg-transparent"
      style={{ clipPath: `inset(${clipTop}px ${clipRight}px 0 ${clipLeft}px)` }}
    >
      <AgentCursorLayer
        cursors={layoutData.presenceCursors}
        frames={layoutData.entities.filter(
          (entity): entity is CanvasSceneFrameEntity => entity.kind === 'frame',
        )}
        overlayOffsetY={layoutData.canvasOrigin.y}
      />
    </div>
  )
}
