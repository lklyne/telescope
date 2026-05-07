import type { CanvasSceneFileEntity, CanvasSceneFrameEntity } from '../../shared/types'
import {
  CUSTOM_SHELL_CORNER_RADIUS,
  DEVICE_CATALOG,
} from '../../shared/device-catalog'

type RingTarget = {
  id: string
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
  contentScreenWidth?: number
  contentScreenHeight?: number
  deviceId?: string | null
  showDeviceFrame?: boolean
  browserSizeMode?: string
  width: number
}

/** Phase F — focused-frame accent ring lives in aboveView so it paints above
 *  page WCVs (and any neighboring page that overlaps the frame's outer rect).
 *  Geometry mirrors the ring previously rendered inside `FrameBorderLayer` in
 *  canvas-bg: 4px outside the outer frame border with a 2px accent + 2px
 *  translucent halo. originY is canvasOrigin.y so frames in window-coords
 *  land at the right WCV-local y. */
export function FrameFocusRingLayer({
  frames,
  fileEntities,
  focusedFrameId,
  originY,
}: {
  frames: CanvasSceneFrameEntity[]
  fileEntities?: CanvasSceneFileEntity[]
  focusedFrameId: string | null
  originY: number
}) {
  if (!focusedFrameId) return null
  const items: RingTarget[] = [
    ...frames,
    ...(fileEntities ?? []).filter((f) => f.showDeviceFrame),
  ]
  const target = items.find((item) => item.id === focusedFrameId)
  if (!target) return null

  const fx = target.screenX
  const fy = target.screenY - originY
  const fw = target.screenWidth
  const fh = target.screenHeight

  const hasShell = target.showDeviceFrame && target.browserSizeMode !== 'fill'
  const dev = hasShell && target.deviceId ? DEVICE_CATALOG.get(target.deviceId) : null
  const cw = target.contentScreenWidth ?? target.screenWidth
  const displayZoom = target.width > 0 ? cw / target.width : 1
  const outerRadius = hasShell
    ? (dev?.cornerRadius ?? CUSTOM_SHELL_CORNER_RADIUS) * displayZoom
    : 0

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: fx - 4,
        top: fy - 4,
        width: fw + 8,
        height: fh + 8,
        borderRadius: outerRadius + 3,
        boxShadow:
          '0 0 0 2px var(--accent), 0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent)',
      }}
    />
  )
}
