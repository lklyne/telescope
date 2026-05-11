/**
 * ShapeToolPopup — viewport-anchored tool-mode popup for the `add-shape` tool
 * (ADR 0008 §1, §5; ADR 0009). Picks the variant + color + stroke width that
 * the next stamped shape will use; values persist via tool defaults.
 *
 * Mounted in `above-view/App.tsx` when `activeTool.kind === 'add-shape'`.
 */

import { CANVAS_COLOR_OPTIONS, resolveCanvasColor } from '../../shared/canvas-colors'
import type {
  CanvasBgElectronAPI,
  LayoutUpdateData,
  ToolDefaultPatch,
} from '../../shared/types'
import { CanvasItemPopup } from './CanvasItemPopup'
import {
  SHAPE_VARIANT_OPTIONS,
  STROKE_WIDTH_PRESETS,
  nearestStrokeWidthPreset,
} from './popupVariantOptions'
import { StrokeWidthSwatch } from './StrokeWidthSwatch'

export function ShapeToolPopup({
  api,
  isDark,
  layout,
}: {
  api: Pick<CanvasBgElectronAPI, 'setToolDefault'>
  isDark: boolean
  layout: LayoutUpdateData
}) {
  const defaults = layout.toolDefaults['add-shape']
  const currentColor = resolveCanvasColor(defaults.color)
  const activeStrokeWidth = nearestStrokeWidthPreset(defaults.strokeWidth)
  return (
    <CanvasItemPopup.ViewportAnchor layout={layout} open offset={8}>
      <CanvasItemPopup.Frame isDark={isDark}>
        <CanvasItemPopup.Section>
          {SHAPE_VARIANT_OPTIONS.map(({ kind, label, Icon }) => (
            <CanvasItemPopup.IconButton
              key={kind}
              isDark={isDark}
              active={defaults.shapeKind === kind}
              title={label}
              ariaLabel={`Set default shape to ${label}`}
              onClick={() => {
                const patch: ToolDefaultPatch = {
                  scope: 'add-shape',
                  key: 'shapeKind',
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
                ariaLabel={`Set default shape color to ${option.label}`}
                onClick={() => {
                  const patch: ToolDefaultPatch = {
                    scope: 'add-shape',
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
              ariaLabel={`Set default shape stroke width to ${width}px`}
              onClick={() => {
                const patch: ToolDefaultPatch = {
                  scope: 'add-shape',
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
