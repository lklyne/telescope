/**
 * ShapePopup — selection-driven popup for shape entities (ADR 0006, ADR 0007).
 * Lets the user morph the shape's variant (per ADR 0007 §Selection-mode
 * consequences), change color and stroke width, and dup/del. Mounts on
 * single OR same-kind multi-select (ADR 0006 §4) — variant/color/width edits
 * fan out across the selection.
 */

import { useEffect, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { CANVAS_COLOR_OPTIONS, resolveCanvasColor } from '../../shared/canvas-colors'
import { POPUP_SHOW_DELAY_MS } from '../../shared/popupTiming'
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

function shared<T>(values: T[]): T | null {
  if (values.length === 0) return null
  const first = values[0]
  return values.every((v) => v === first) ? first : null
}

export function ShapePopup({
  api,
  isDark,
  layout,
  selectedShapes,
  interactionIdle,
}: {
  api: Pick<
    CanvasBgElectronAPI,
    'duplicateShapeEntity' | 'deleteShapeEntity' | 'updateShapeEntity'
  >
  isDark: boolean
  layout: LayoutUpdateData
  selectedShapes: CanvasSceneShapeEntity[]
  interactionIdle: boolean
}) {
  const count = selectedShapes.length
  const ids = selectedShapes.map((e) => e.id).join('|')
  const shouldQueue = interactionIdle && count > 0
  const [delayedKey, setDelayedKey] = useState<string | null>(null)
  useEffect(() => {
    if (!shouldQueue) {
      setDelayedKey(null)
      return
    }
    const timeoutId = window.setTimeout(() => {
      setDelayedKey(ids)
    }, POPUP_SHOW_DELAY_MS)
    return () => window.clearTimeout(timeoutId)
  }, [shouldQueue, ids])
  if (count === 0) return null
  const open = delayedKey === ids

  const sharedShapeKind = shared(selectedShapes.map((s) => s.shapeKind))
  const colors = selectedShapes.map((s) =>
    s.color ? resolveCanvasColor(s.color) : null,
  )
  const sharedColor = shared(colors)
  const widths = selectedShapes.map((s) =>
    s.strokeWidth !== undefined ? nearestStrokeWidthPreset(s.strokeWidth) : null,
  )
  const sharedStrokeWidth = shared(widths)

  const entityIds = selectedShapes.map((s) => s.id)
  const noun = count === 1 ? 'shape' : `${count} shapes`

  return (
    <CanvasItemPopup.Root
      entityIds={entityIds}
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
              active={sharedShapeKind === kind}
              title={label}
              ariaLabel={`Morph ${noun} to ${label}`}
              onClick={() => {
                const patch: { shapeKind: ShapeKind } = { shapeKind: kind }
                for (const s of selectedShapes) api.updateShapeEntity(s.id, patch)
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
                active={sharedColor === resolved}
                color={resolved}
                ariaLabel={`Set ${noun} color to ${option.label}`}
                onClick={() => {
                  for (const s of selectedShapes) {
                    api.updateShapeEntity(s.id, { color: option.id })
                  }
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
              active={sharedStrokeWidth === width}
              width={width}
              ariaLabel={`Set ${noun} stroke width to ${width}px`}
              onClick={() => {
                for (const s of selectedShapes) {
                  api.updateShapeEntity(s.id, { strokeWidth: width })
                }
              }}
            />
          ))}
        </CanvasItemPopup.Section>
        <CanvasItemPopup.Section>
          <CanvasItemPopup.IconButton
            isDark={isDark}
            title={`Duplicate ${noun}`}
            ariaLabel={`Duplicate ${noun}`}
            onClick={() => {
              for (const s of selectedShapes) api.duplicateShapeEntity(s.id)
            }}
          >
            <Copy size={14} />
          </CanvasItemPopup.IconButton>
          <CanvasItemPopup.DestructiveButton
            isDark={isDark}
            title={`Delete ${noun}`}
            ariaLabel={`Delete ${noun}`}
            onClick={() => {
              for (const s of selectedShapes) api.deleteShapeEntity(s.id)
            }}
          >
            <Trash2 size={14} />
          </CanvasItemPopup.DestructiveButton>
        </CanvasItemPopup.Section>
      </CanvasItemPopup.Frame>
    </CanvasItemPopup.Root>
  )
}
