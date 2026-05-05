import React from 'react'
import type { CanvasSceneFrameEntity, CanvasSceneFileEntity } from '../../shared/types'
import {
  CUSTOM_SHELL_CORNER_RADIUS,
  CUSTOM_SHELL_SCREEN_CORNER_RADIUS,
  DEVICE_CATALOG,
  contentCornerRadiusForDevice,
} from '../../shared/device-catalog'

type BorderItem = {
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
  useSvgDeviceShell?: boolean
  browserSizeMode?: string
  width: number
}

export function FrameBorderLayer({
  frames,
  fileEntities,
  offsetY = 0,
  focusedFrameId,
}: {
  frames: CanvasSceneFrameEntity[]
  fileEntities?: CanvasSceneFileEntity[]
  offsetY?: number
  /** Frame currently in click-to-enter focus (ADR 0001). Renders an
   *  accent ring around the outer border. */
  focusedFrameId?: string | null
}) {
  const items: BorderItem[] = [...frames, ...(fileEntities ?? []).filter((f) => f.showDeviceFrame)]
  return (
    <>
      {items.map((frame) => {
        // Inner content border
        const cx = frame.contentScreenX ?? frame.screenX
        const cy = (frame.contentScreenY ?? frame.screenY) - offsetY
        const cw = frame.contentScreenWidth ?? frame.screenWidth
        const ch = frame.contentScreenHeight ?? frame.screenHeight

        // Outer frame border
        const fx = frame.screenX
        const fy = frame.screenY - offsetY
        const fw = frame.screenWidth
        const fh = frame.screenHeight

        const hasShell = frame.showDeviceFrame && frame.browserSizeMode !== 'fill'

        // SVG device shell handles its own borders
        if (hasShell && frame.useSvgDeviceShell) return null
        const dev = hasShell && frame.deviceId ? DEVICE_CATALOG.get(frame.deviceId) : null
        const displayZoom = frame.width > 0 ? cw / frame.width : 1
        const innerRadius = hasShell
          ? (dev
              ? contentCornerRadiusForDevice(frame.deviceId!, frame.deviceOrientation ?? 'portrait')
              : CUSTOM_SHELL_SCREEN_CORNER_RADIUS) * displayZoom
          : 0
        const outerRadius = hasShell
          ? (dev?.cornerRadius ?? CUSTOM_SHELL_CORNER_RADIUS) * displayZoom
          : 0

        const isFocused = frame.id === focusedFrameId
        const borderStyle = '1px solid var(--surface-device-border)'

        // Both borders render for every frame. For non-device frames the outer
        // and inner rects coincide (contentScreen* falls back to screen*), so
        // the two 1px borders simply overlap — visually identical to one border.
        // When a device shell is active the outer border traces the bezel edge
        // and the inner border traces the content viewport cutout.
        return (
          <React.Fragment key={frame.id}>
            {/* Focus ring (ADR 0001) — drawn outside the outer border so it
                wraps the entire frame including the device shell. */}
            {isFocused && (
              <div
                className="pointer-events-none absolute"
                style={{
                  left: fx - 4,
                  top: fy - 4,
                  width: fw + 8,
                  height: fh + 8,
                  borderRadius: outerRadius + 3,
                  boxShadow: '0 0 0 2px var(--accent), 0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent)',
                }}
              />
            )}
            {/* Outer frame border */}
            <div
              className="pointer-events-none absolute"
              style={{
                left: fx - 1,
                top: fy - 1,
                width: fw + 2,
                height: fh + 2,
                borderRadius: outerRadius,
                border: borderStyle,
              }}
            />
            {/* Inner content border */}
            <div
              className="pointer-events-none absolute"
              style={{
                left: cx - 1,
                top: cy - 1,
                width: cw + 2,
                height: ch + 2,
                borderRadius: innerRadius,
                border: borderStyle,
              }}
            />
          </React.Fragment>
        )
      })}
    </>
  )
}
