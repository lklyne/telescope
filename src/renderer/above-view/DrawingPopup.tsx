/**
 * DrawingPopup — selection-driven popup for the single-selected drawing entity
 * (ADR 0006 §8). Edits the inner stroke's `brushType`, `color`, and `width`,
 * plus dup/del. Per ADR §8 every drawing has exactly one stroke; if a drawing
 * has multiple (legacy import), edits are applied uniformly to all strokes.
 */

import { useEffect, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { CANVAS_COLOR_OPTIONS, resolveCanvasColor } from '../../shared/canvas-colors'
import { SELECTED_PAGE_MENU_SHOW_DELAY_MS } from '../../shared/selectedPageMenu'
import type {
  AnnotationDrawingStroke,
  CanvasBgElectronAPI,
  CanvasSceneDrawingEntity,
  DrawingBrushType,
  LayoutUpdateData,
} from '../../shared/types'
import { CanvasItemPopup } from './CanvasItemPopup'
import {
  BRUSH_VARIANT_OPTIONS,
  STROKE_WIDTH_PRESETS,
  nearestStrokeWidthPreset,
} from './popupVariantOptions'
import { StrokeWidthSwatch } from './StrokeWidthSwatch'

const POPUP_OFFSET_Y = 14

function dominantBrush(strokes: AnnotationDrawingStroke[]): DrawingBrushType | null {
  if (!strokes.length) return null
  const first = strokes[0].brushType ?? 'pen'
  return strokes.every((s) => (s.brushType ?? 'pen') === first) ? first : null
}

function dominantColor(strokes: AnnotationDrawingStroke[]): string | null {
  if (!strokes.length) return null
  const first = strokes[0].color
  return strokes.every((s) => s.color === first) ? first : null
}

function dominantWidth(strokes: AnnotationDrawingStroke[]): number | null {
  if (!strokes.length) return null
  const first = strokes[0].width
  return strokes.every((s) => s.width === first) ? first : null
}

export function DrawingPopup({
  api,
  isDark,
  layout,
  selectedDrawing,
  interactionIdle,
}: {
  api: Pick<
    CanvasBgElectronAPI,
    'duplicateDrawingEntity' | 'deleteDrawingEntity' | 'updateDrawingEntity'
  >
  isDark: boolean
  layout: LayoutUpdateData
  selectedDrawing: CanvasSceneDrawingEntity | null
  interactionIdle: boolean
}) {
  const shouldQueue = interactionIdle && selectedDrawing !== null
  const [delayedId, setDelayedId] = useState<string | null>(null)
  useEffect(() => {
    if (!shouldQueue || !selectedDrawing) {
      setDelayedId(null)
      return
    }
    const timeoutId = window.setTimeout(() => {
      setDelayedId(selectedDrawing.id)
    }, SELECTED_PAGE_MENU_SHOW_DELAY_MS)
    return () => window.clearTimeout(timeoutId)
  }, [shouldQueue, selectedDrawing])
  if (!selectedDrawing) return null
  const open = delayedId === selectedDrawing.id
  const brush = dominantBrush(selectedDrawing.strokes)
  const colorRaw = dominantColor(selectedDrawing.strokes)
  const currentColor = colorRaw === null ? null : resolveCanvasColor(colorRaw)
  const widthRaw = dominantWidth(selectedDrawing.strokes)
  const activeStrokeWidth = widthRaw === null ? null : nearestStrokeWidthPreset(widthRaw)

  const writeStrokes = (rewrite: (stroke: AnnotationDrawingStroke) => AnnotationDrawingStroke) => {
    const next = selectedDrawing.strokes.map(rewrite)
    api.updateDrawingEntity(selectedDrawing.id, { strokes: next })
  }

  return (
    <CanvasItemPopup.Root
      entityId={selectedDrawing.id}
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
              ariaLabel={`Switch drawing brush to ${label}`}
              onClick={() => writeStrokes((stroke) => ({ ...stroke, brushType: kind }))}
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
                ariaLabel={`Set drawing color to ${option.label}`}
                onClick={() => writeStrokes((stroke) => ({ ...stroke, color: resolved }))}
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
              ariaLabel={`Set drawing stroke width to ${width}px`}
              onClick={() => writeStrokes((stroke) => ({ ...stroke, width }))}
            />
          ))}
        </CanvasItemPopup.Section>
        <CanvasItemPopup.Section>
          <CanvasItemPopup.IconButton
            isDark={isDark}
            title="Duplicate drawing"
            ariaLabel="Duplicate drawing"
            onClick={() => api.duplicateDrawingEntity(selectedDrawing.id)}
          >
            <Copy size={14} />
          </CanvasItemPopup.IconButton>
          <CanvasItemPopup.DestructiveButton
            isDark={isDark}
            title="Delete drawing"
            ariaLabel="Delete drawing"
            onClick={() => api.deleteDrawingEntity(selectedDrawing.id)}
          >
            <Trash2 size={14} />
          </CanvasItemPopup.DestructiveButton>
        </CanvasItemPopup.Section>
      </CanvasItemPopup.Frame>
    </CanvasItemPopup.Root>
  )
}
