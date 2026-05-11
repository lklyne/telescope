/**
 * DrawingPopup — selection-driven popup for drawing entities (ADR 0006 §8).
 * Edits inner strokes' `brushType`, `color`, and `width`, plus dup/del.
 * Per ADR §8 every drawing has exactly one stroke; legacy drawings with
 * multiple strokes accept uniform writes across all strokes.
 *
 * Mounts on single OR same-kind multi-select (ADR 0006 §4) — edits fan out
 * across every selected drawing and every stroke inside each one.
 */

import { Copy, Trash2 } from 'lucide-react'
import { CANVAS_COLOR_OPTIONS, resolveCanvasColor } from '../../shared/canvas-colors'
import type {
  AnnotationDrawingStroke,
  CanvasBgElectronAPI,
  CanvasSceneDrawingEntity,
  LayoutUpdateData,
} from '../../shared/types'
import { CanvasItemPopup } from './CanvasItemPopup'
import { drawingBounds } from './annotationMath'
import {
  BRUSH_VARIANT_OPTIONS,
  nearestStrokeWidthPreset,
  strokeWidthPresetsFor,
} from './popupVariantOptions'
import { StrokeWidthSwatch } from './StrokeWidthSwatch'
import { POPUP_OFFSET_Y, sharedValue, usePopupDelayedKey } from './usePopupDelayedKey'

export function DrawingPopup({
  api,
  isDark,
  layout,
  selectedDrawings,
  interactionIdle,
}: {
  api: Pick<
    CanvasBgElectronAPI,
    'duplicateDrawingEntity' | 'deleteDrawingEntity' | 'updateDrawingEntity'
  >
  isDark: boolean
  layout: LayoutUpdateData
  selectedDrawings: CanvasSceneDrawingEntity[]
  interactionIdle: boolean
}) {
  const count = selectedDrawings.length
  const ids = selectedDrawings.map((e) => e.id).join('|')
  const open = usePopupDelayedKey(ids, interactionIdle && count > 0)
  if (count === 0) return null

  const allStrokes = selectedDrawings.flatMap((d) => d.strokes)
  const brush = sharedValue(allStrokes.map((s) => s.brushType ?? 'pen'))
  const colorRaw = sharedValue(allStrokes.map((s) => s.color))
  const currentColor = colorRaw === null ? null : resolveCanvasColor(colorRaw)
  const widthRaw = sharedValue(allStrokes.map((s) => s.width))
  const widthPresets = strokeWidthPresetsFor(brush ?? undefined)
  const activeStrokeWidth =
    widthRaw === null ? null : nearestStrokeWidthPreset(widthRaw, widthPresets)

  const writeStrokes = (
    rewrite: (stroke: AnnotationDrawingStroke) => AnnotationDrawingStroke,
  ) => {
    for (const drawing of selectedDrawings) {
      const next = drawing.strokes.map(rewrite)
      const bbox = drawingBounds(next)
      api.updateDrawingEntity(drawing.id, {
        strokes: next,
        canvasX: bbox.x,
        canvasY: bbox.y,
        width: bbox.width,
        height: bbox.height,
      })
    }
  }

  const entityIds = selectedDrawings.map((d) => d.id)
  const noun = count === 1 ? 'drawing' : `${count} drawings`

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
          {BRUSH_VARIANT_OPTIONS.map(({ kind, label, Icon }) => (
            <CanvasItemPopup.IconButton
              key={kind}
              isDark={isDark}
              active={brush === kind}
              title={label}
              ariaLabel={`Switch ${noun} brush to ${label}`}
              onClick={() => {
                const targetPresets = strokeWidthPresetsFor(kind)
                writeStrokes((stroke) => ({
                  ...stroke,
                  brushType: kind,
                  width: nearestStrokeWidthPreset(stroke.width, targetPresets),
                }))
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
                ariaLabel={`Set ${noun} color to ${option.label}`}
                onClick={() => writeStrokes((stroke) => ({ ...stroke, color: resolved }))}
              />
            )
          })}
        </CanvasItemPopup.Section>
        <CanvasItemPopup.Section>
          {widthPresets.map((width) => (
            <StrokeWidthSwatch
              key={width}
              isDark={isDark}
              active={activeStrokeWidth === width}
              width={width}
              ariaLabel={`Set ${noun} stroke width to ${width}px`}
              onClick={() => writeStrokes((stroke) => ({ ...stroke, width }))}
            />
          ))}
        </CanvasItemPopup.Section>
        <CanvasItemPopup.Section>
          <CanvasItemPopup.IconButton
            isDark={isDark}
            title={`Duplicate ${noun}`}
            ariaLabel={`Duplicate ${noun}`}
            onClick={() => {
              for (const d of selectedDrawings) api.duplicateDrawingEntity(d.id)
            }}
          >
            <Copy size={14} />
          </CanvasItemPopup.IconButton>
          <CanvasItemPopup.DestructiveButton
            isDark={isDark}
            title={`Delete ${noun}`}
            ariaLabel={`Delete ${noun}`}
            onClick={() => {
              for (const d of selectedDrawings) api.deleteDrawingEntity(d.id)
            }}
          >
            <Trash2 size={14} />
          </CanvasItemPopup.DestructiveButton>
        </CanvasItemPopup.Section>
      </CanvasItemPopup.Frame>
    </CanvasItemPopup.Root>
  )
}
