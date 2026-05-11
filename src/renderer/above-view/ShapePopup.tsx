/**
 * ShapePopup — selection-driven popup for the single-selected shape entity
 * (ADR 0006, ADR 0007). Lets the user morph the shape's variant (per ADR 0007
 * §Selection-mode consequences), change color and stroke width, and dup/del.
 */

import { useEffect, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { CANVAS_COLOR_OPTIONS, resolveCanvasColor } from '../../shared/canvas-colors'
import { SELECTED_PAGE_MENU_SHOW_DELAY_MS } from '../../shared/selectedPageMenu'
import type {
  CanvasBgElectronAPI,
  CanvasSceneShapeEntity,
  LayoutUpdateData,
  ShapeKind,
} from '../../shared/types'
import { CanvasItemPopup } from './CanvasItemPopup'
import {
  SHAPE_VARIANT_OPTIONS,
  STROKE_WIDTH_PRESETS,
  nearestStrokeWidthPreset,
} from './popupVariantOptions'
import { StrokeWidthSwatch } from './StrokeWidthSwatch'

const POPUP_OFFSET_Y = 14

export function ShapePopup({
  api,
  isDark,
  layout,
  selectedShape,
  interactionIdle,
}: {
  api: Pick<
    CanvasBgElectronAPI,
    'duplicateShapeEntity' | 'deleteShapeEntity' | 'updateShapeEntity'
  >
  isDark: boolean
  layout: LayoutUpdateData
  selectedShape: CanvasSceneShapeEntity | null
  interactionIdle: boolean
}) {
  const shouldQueue = interactionIdle && selectedShape !== null
  const [delayedId, setDelayedId] = useState<string | null>(null)
  useEffect(() => {
    if (!shouldQueue || !selectedShape) {
      setDelayedId(null)
      return
    }
    const timeoutId = window.setTimeout(() => {
      setDelayedId(selectedShape.id)
    }, SELECTED_PAGE_MENU_SHOW_DELAY_MS)
    return () => window.clearTimeout(timeoutId)
  }, [shouldQueue, selectedShape])
  if (!selectedShape) return null
  const open = delayedId === selectedShape.id
  const currentColor = selectedShape.color ? resolveCanvasColor(selectedShape.color) : null
  const activeStrokeWidth =
    selectedShape.strokeWidth !== undefined
      ? nearestStrokeWidthPreset(selectedShape.strokeWidth)
      : null
  return (
    <CanvasItemPopup.Root
      entityId={selectedShape.id}
      layout={layout}
      open={open}
      placement="above"
      offset={POPUP_OFFSET_Y}
    >
      <CanvasItemPopup.Frame isDark={isDark}>
        <CanvasItemPopup.Section>
          {SHAPE_VARIANT_OPTIONS.map(({ kind, label, Icon }) => (
            <CanvasItemPopup.IconButton
              key={kind}
              isDark={isDark}
              active={selectedShape.shapeKind === kind}
              title={label}
              ariaLabel={`Morph shape to ${label}`}
              onClick={() => {
                const patch: { shapeKind: ShapeKind } = { shapeKind: kind }
                api.updateShapeEntity(selectedShape.id, patch)
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
                ariaLabel={`Set shape color to ${option.label}`}
                onClick={() => api.updateShapeEntity(selectedShape.id, { color: option.id })}
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
              ariaLabel={`Set shape stroke width to ${width}px`}
              onClick={() => api.updateShapeEntity(selectedShape.id, { strokeWidth: width })}
            />
          ))}
        </CanvasItemPopup.Section>
        <CanvasItemPopup.Section>
          <CanvasItemPopup.IconButton
            isDark={isDark}
            title="Duplicate shape"
            ariaLabel="Duplicate shape"
            onClick={() => api.duplicateShapeEntity(selectedShape.id)}
          >
            <Copy size={14} />
          </CanvasItemPopup.IconButton>
          <CanvasItemPopup.DestructiveButton
            isDark={isDark}
            title="Delete shape"
            ariaLabel="Delete shape"
            onClick={() => api.deleteShapeEntity(selectedShape.id)}
          >
            <Trash2 size={14} />
          </CanvasItemPopup.DestructiveButton>
        </CanvasItemPopup.Section>
      </CanvasItemPopup.Frame>
    </CanvasItemPopup.Root>
  )
}
