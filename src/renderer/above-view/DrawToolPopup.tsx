/**
 * DrawToolPopup — viewport-anchored tool-mode popup for the `draw` tool
 * (ADR 0006 §1, §5; ADR 0007). Picks the brush + color + stroke width that
 * the next stroke will use; values persist via tool defaults.
 *
 * Mounted in `above-view/App.tsx` when `activeTool.kind === 'draw'`.
 */

import { CANVAS_COLOR_OPTIONS, resolveCanvasColor } from '../../shared/canvas-colors'
import type {
  CanvasBgElectronAPI,
  LayoutUpdateData,
  ToolDefaultPatch,
} from '../../shared/types'
import { CanvasItemPopup } from './CanvasItemPopup'
import {
  BRUSH_VARIANT_OPTIONS,
  STROKE_WIDTH_PRESETS,
  nearestStrokeWidthPreset,
} from './popupVariantOptions'
import { StrokeWidthSwatch } from './StrokeWidthSwatch'

export function DrawToolPopup({
  api,
  isDark,
  layout,
}: {
  api: Pick<CanvasBgElectronAPI, 'setToolDefault'>
  isDark: boolean
  layout: LayoutUpdateData
}) {
  const defaults = layout.toolDefaults.draw
  const currentColor = resolveCanvasColor(defaults.color)
  const activeStrokeWidth = nearestStrokeWidthPreset(defaults.strokeWidth)
  return (
    <CanvasItemPopup.ViewportAnchor layout={layout} open offset={8}>
      <CanvasItemPopup.Frame isDark={isDark}>
        <CanvasItemPopup.Section>
          {BRUSH_VARIANT_OPTIONS.map(({ kind, label, Icon }) => (
            <CanvasItemPopup.IconButton
              key={kind}
              isDark={isDark}
              active={defaults.brushType === kind}
              title={label}
              ariaLabel={`Set default brush to ${label}`}
              onClick={() => {
                const patch: ToolDefaultPatch = {
                  scope: 'draw',
                  key: 'brushType',
                  value: kind,
                }
                api.setToolDefault(patch)
              }}
            >
              <Icon size={14} />
            </CanvasItemPopup.IconButton>
          ))}
        </CanvasItemPopup.Section>
        <CanvasItemPopup.Section>
          {CANVAS_COLOR_OPTIONS.map((option) => {
            const resolved = resolveCanvasColor(option.id)
            return (
              <CanvasItemPopup.ColorSwatch
                key={option.id}
                isDark={isDark}
                active={currentColor === resolved}
                color={resolved}
                ariaLabel={`Set default brush color to ${option.label}`}
                onClick={() => {
                  const patch: ToolDefaultPatch = {
                    scope: 'draw',
                    key: 'color',
                    value: option.id,
                  }
                  api.setToolDefault(patch)
                }}
              />
            )
          })}
        </CanvasItemPopup.Section>
        <CanvasItemPopup.Section>
          {STROKE_WIDTH_PRESETS.map((width) => (
            <StrokeWidthSwatch
              key={width}
              isDark={isDark}
              active={activeStrokeWidth === width}
              width={width}
              ariaLabel={`Set default brush width to ${width}px`}
              onClick={() => {
                const patch: ToolDefaultPatch = {
                  scope: 'draw',
                  key: 'strokeWidth',
                  value: width,
                }
                api.setToolDefault(patch)
              }}
            />
          ))}
        </CanvasItemPopup.Section>
      </CanvasItemPopup.Frame>
    </CanvasItemPopup.ViewportAnchor>
  )
}
