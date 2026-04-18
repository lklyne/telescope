import type { CanvasSceneFrameEntity, CanvasSceneFileEntity } from '../../shared/types'
import {
  CUSTOM_SHELL_CORNER_RADIUS,
  CUSTOM_SHELL_SCREEN_CORNER_RADIUS,
  DEVICE_CATALOG,
  contentCornerRadiusForDevice,
} from '../../shared/device-catalog'

/** Shared shape for anything that can render a device shell. */
interface DeviceShellItem {
  id: string
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
  contentScreenX?: number
  contentScreenY?: number
  contentScreenWidth?: number
  contentScreenHeight?: number
  deviceId?: string | null
  deviceOrientation?: 'portrait' | 'landscape'
  showDeviceFrame?: boolean
  width: number
}

export function DeviceShellLayer({
  frames,
  fileEntities,
  isDark,
}: {
  frames: CanvasSceneFrameEntity[]
  fileEntities?: CanvasSceneFileEntity[]
  isDark: boolean
}) {
  const framedFrames: DeviceShellItem[] = frames.filter((f) => f.showDeviceFrame && f.sizeMode !== 'fill')
  const framedFiles: DeviceShellItem[] = (fileEntities ?? []).filter((f) => f.showDeviceFrame)

  if (!framedFrames.length && !framedFiles.length) return null

  const renderItem = (frame: DeviceShellItem) => {
        const dev = frame.deviceId ? DEVICE_CATALOG.get(frame.deviceId) : null

        const orientation = frame.deviceOrientation ?? 'portrait'

        const contentX = frame.contentScreenX ?? frame.screenX
        const contentY = frame.contentScreenY ?? frame.screenY
        const contentW = frame.contentScreenWidth ?? frame.screenWidth
        const contentH = frame.contentScreenHeight ?? frame.screenHeight

        // Shell outer rect is screenX/Y/Width/Height (already outer bounds)
        const shellX = frame.screenX
        const shellY = frame.screenY
        const shellW = frame.screenWidth
        const shellH = frame.screenHeight

        // Insets in screen space
        const insetTop = contentY - shellY
        const insetLeft = contentX - shellX
        const insetBottom = shellY + shellH - (contentY + contentH)
        const insetRight = shellX + shellW - (contentX + contentW)

        // Derive zoom from screen vs logical content width
        const displayZoom = frame.width > 0 ? contentW / frame.width : 1
        const outerRadius = (dev?.cornerRadius ?? CUSTOM_SHELL_CORNER_RADIUS) * displayZoom
        const innerRadius = dev
          ? contentCornerRadiusForDevice(frame.deviceId!, orientation) * displayZoom
          : CUSTOM_SHELL_SCREEN_CORNER_RADIUS * displayZoom

        const isPhone = dev?.category === 'iphone'
        const isTablet = dev?.category === 'ipad'

        const bezelColor = 'var(--surface-device)'
        const bezelHighlight = isDark
          ? 'rgba(255,255,255,0.04)'
          : 'rgba(255,255,255,0.5)'

        return (
          <div
            key={frame.id}
            className="pointer-events-none absolute"
            style={{
              left: shellX,
              top: shellY,
              width: shellW,
              height: shellH,
              filter: isDark
                ? `drop-shadow(0 ${16 * displayZoom}px ${16 * displayZoom}px rgba(0,0,0,0.8))`
                : `drop-shadow(0 ${16 * displayZoom}px ${16 * displayZoom}px rgba(0,0,0,0.24))`,
            }}
          >
            {/* Outer bezel */}
            <div
              className="absolute inset-0"
              style={{
                borderRadius: outerRadius,
                background: bezelColor,
                boxShadow: isDark
                  ? `inset 0 1px 0 ${bezelHighlight}, 0 0 0 1px rgba(0,0,0,0.15)`
                  : `inset 0 1px 0 ${bezelHighlight}, 0 0 0 1px rgba(0,0,0,0.06)`,
              }}
            />

            {/* Content cutout (transparent hole) */}
            <div
              className="absolute overflow-hidden"
              style={{
                left: insetLeft,
                top: insetTop,
                width: contentW,
                height: contentH,
                borderRadius: innerRadius,
                boxShadow: isDark
                  ? `inset 0 0 0 1px rgba(255,255,255,0.06)`
                  : `inset 0 0 0 1px rgba(0,0,0,0.06)`,
              }}
            />

            {/* Mask so bezel doesn't cover content — use clip-path with hole */}
            <div
              className="absolute inset-0"
              style={{
                borderRadius: outerRadius,
                background: bezelColor,
                clipPath: `polygon(
                  0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
                  ${pct(insetLeft, shellW)} ${pct(insetTop, shellH)},
                  ${pct(insetLeft, shellW)} ${pct(insetTop + contentH, shellH)},
                  ${pct(insetLeft + contentW, shellW)} ${pct(insetTop + contentH, shellH)},
                  ${pct(insetLeft + contentW, shellW)} ${pct(insetTop, shellH)},
                  ${pct(insetLeft, shellW)} ${pct(insetTop, shellH)}
                )`,
                boxShadow: isDark
                  ? `inset 0 1px 0 ${bezelHighlight}`
                  : `inset 0 1px 0 ${bezelHighlight}`,
              }}
            />

            {/* Phone-specific: Dynamic Island (edge-to-edge phones only) */}
            {isPhone &&
              dev.screenCornerRadius > 0 &&
              orientation === 'portrait' && (
                <div
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{
                    top: insetTop + 8 * displayZoom,
                    width: 126 * displayZoom,
                    height: 37 * displayZoom,
                    borderRadius: 18.5 * displayZoom,
                    background: isDark ? '#000' : '#1a1a1a',
                  }}
                />
              )}

            {/* Phone-specific: Home indicator */}
            {isPhone && (
              <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{
                  bottom: Math.max(
                    4 * displayZoom,
                    insetBottom / 2 - 4 * displayZoom,
                  ),
                  width: (orientation === 'portrait' ? 120 : 100) * displayZoom,
                  height: 4 * displayZoom,
                  borderRadius: 2 * displayZoom,
                  background: isDark
                    ? 'rgba(255,255,255,0.25)'
                    : 'rgba(0,0,0,0.15)',
                }}
              />
            )}

            {/* Tablet-specific: subtle home indicator */}
            {isTablet && (
              <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{
                  bottom: Math.max(
                    4 * displayZoom,
                    insetBottom / 2 - 3 * displayZoom,
                  ),
                  width: 100 * displayZoom,
                  height: 4 * displayZoom,
                  borderRadius: 2 * displayZoom,
                  background: isDark
                    ? 'rgba(255,255,255,0.2)'
                    : 'rgba(0,0,0,0.12)',
                }}
              />
            )}
          </div>
        )
  }

  return (
    <>
      {framedFrames.map(renderItem)}
      {framedFiles.map(renderItem)}
    </>
  )
}

function pct(value: number, total: number): string {
  return `${((value / total) * 100).toFixed(4)}%`
}
