import { useEffect, useState } from 'react'
import type {
  CanvasBgElectronAPI,
  CanvasSceneFrameEntity,
  CursorMotionParams,
  LayoutUpdateData,
} from '../../shared/types'
import { AgentCursorLayer } from '../canvas-bg/AgentCursorLayer'

const api = (window as unknown as { electronAPI: CanvasBgElectronAPI }).electronAPI

export default function App({
  initialLayoutData,
  initialCursorMotion,
}: {
  initialLayoutData: LayoutUpdateData
  initialCursorMotion: CursorMotionParams
}) {
  const [layoutData, setLayoutData] = useState<LayoutUpdateData>(initialLayoutData)
  const [cursorMotion, setCursorMotion] =
    useState<CursorMotionParams>(initialCursorMotion)

  useEffect(() => api.onLayoutUpdate(setLayoutData), [])
  useEffect(() => api.onCursorMotionChanged(setCursorMotion), [])

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-transparent">
      <AgentCursorLayer
        cursors={layoutData.presenceCursors}
        frames={layoutData.entities.filter(
          (entity): entity is CanvasSceneFrameEntity => entity.kind === 'frame',
        )}
        overlayOffsetY={layoutData.canvasOrigin.y}
        motionParams={cursorMotion}
      />
    </div>
  )
}
