import { useMemo } from 'react'
import { buildCanvasGridStyle } from './canvasGridStyle'

function previewBoxStyle(
  isDark: boolean,
  preview: { left: number; top: number; width: number; height: number },
) {
  return {
    left: preview.left,
    top: preview.top,
    width: preview.width,
    height: preview.height,
    borderColor: isDark ? 'rgba(214, 211, 209, 0.22)' : 'rgba(87, 83, 78, 0.28)',
    background: isDark ? 'rgba(41, 37, 36, 0.78)' : 'rgba(214, 211, 209, 0.92)',
    boxShadow: isDark
      ? '0 1px 2px rgba(0, 0, 0, 0.18)'
      : '0 1px 2px rgba(87, 83, 78, 0.08)',
  }
}

export function CanvasDebugBadge({
  annotationCount,
  annotationMode,
  isDev,
  layoutTick,
}: {
  annotationCount: number
  annotationMode: import('../../shared/types').LayoutUpdateData['annotationMode']
  isDev: boolean
  layoutTick: number
}) {
  if (!isDev) return null
  return (
    <div
      className="pointer-events-auto absolute left-2 top-2 z-[70] rounded border border-zinc-300/80 bg-white/90 px-2 py-1 text-[10px] text-zinc-700 shadow dark:border-zinc-600 dark:bg-zinc-900/90 dark:text-zinc-200"
      data-overlay-ui
    >
      mode:{annotationMode} updates:{layoutTick} pending: 0 anns:{annotationCount} hits:0
    </div>
  )
}

export function CanvasGridSurface({
  bgRef,
  isDark,
  canvasOrigin,
  pan,
  zoom,
}: {
  bgRef: React.RefObject<HTMLDivElement | null>
  isDark: boolean
  canvasOrigin: { x: number; y: number }
  pan: { x: number; y: number }
  zoom: number
}) {
  const gridStyle = useMemo(
    () =>
      buildCanvasGridStyle({
        canvasOrigin,
        pan,
        zoom,
        isDark,
        devicePixelRatio: window.devicePixelRatio || 1,
      }),
    [canvasOrigin, isDark, pan, zoom],
  )

  return (
    <div
      ref={bgRef}
      tabIndex={0}
      className="absolute inset-0 outline-none"
      style={{
        touchAction: 'none',
        ...gridStyle,
      }}
    />
  )
}

export function PlacementPreviewLayer({
  isDark,
  preview,
}: {
  isDark: boolean
  preview: { entityKind?: string; shapeKind?: string; left: number; top: number; width: number; height: number } | null
}) {
  if (!preview) return null
  const isTextEntity = preview.entityKind === 'text'
  const isFileEntity = preview.entityKind === 'file'
  const isShape = preview.entityKind === 'shape'
  if (isShape) {
    const baseStyle = previewBoxStyle(isDark, preview)
    const stroke = isDark ? 'rgba(168, 162, 158, 0.6)' : 'rgba(120, 113, 108, 0.6)'
    const fill = 'transparent'
    if (preview.shapeKind === 'ellipse') {
      return (
        <div
          className="pointer-events-none absolute border"
          style={{ ...baseStyle, borderRadius: '50%', borderColor: stroke, background: fill }}
        />
      )
    }
    if (preview.shapeKind === 'diamond') {
      return (
        <div
          className="pointer-events-none absolute"
          style={{ ...baseStyle, background: 'transparent' }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: `${(1 / Math.SQRT2) * 100}%`,
                height: `${(1 / Math.SQRT2) * 100}%`,
                transform: 'rotate(45deg)',
                border: `1px solid ${stroke}`,
                background: fill,
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      )
    }
    return (
      <div
        className="pointer-events-none absolute border"
        style={{ ...baseStyle, borderColor: stroke, background: fill }}
      />
    )
  }
  return (
    <div
      className={`pointer-events-none absolute border ${isTextEntity || isFileEntity ? '' : 'rounded-[8px]'}`}
      style={{
        ...previewBoxStyle(isDark, preview),
        ...(isTextEntity
          ? {
              background: 'rgba(254, 240, 138, 0.7)',
              borderColor: 'rgba(202, 138, 4, 0.4)',
            }
          : isFileEntity
            ? {
                background: isDark ? 'rgba(214, 211, 209, 0.15)' : 'rgba(250, 250, 249, 0.7)',
                borderColor: isDark ? 'rgba(168, 162, 158, 0.4)' : 'rgba(120, 113, 108, 0.4)',
                borderRadius: 4,
              }
            : {}),
      }}
    />
  )
}

export function DragCopyPreviewLayer({
  dragCopyPreview,
  isDark,
}: {
  dragCopyPreview: Array<{ id: string; left: number; top: number; width: number; height: number }>
  isDark: boolean
}) {
  return (
    <>
      {dragCopyPreview.map((preview) => (
        <div
          key={`drag-copy-preview-${preview.id}`}
          className="pointer-events-none absolute rounded-[8px] border"
          style={previewBoxStyle(isDark, preview)}
        />
      ))}
    </>
  )
}

export function CanvasEntityViewportLayer({
  canvasOrigin,
  pan,
  zoom,
  children,
}: {
  canvasOrigin: { x: number; y: number }
  pan: { x: number; y: number }
  zoom: number
  children: React.ReactNode
}) {
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 origin-top-left"
      style={{
        ['--canvas-zoom' as string]: zoom,
        transform: `translate(${canvasOrigin.x + pan.x}px, ${canvasOrigin.y + pan.y}px) scale(${zoom})`,
      }}
    >
      {children}
    </div>
  )
}
