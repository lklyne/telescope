import type { SelectionOverlayPayload } from '../../shared/types'

/**
 * Marquee rectangle layer — pointer-events: none visual only.
 * Driven by the `canvas-selection-overlay` IPC which canvas-bg's gesture
 * code sends via setSelectionOverlayRect.
 */
export function MarqueeLayer({ overlay }: { overlay: SelectionOverlayPayload | null }) {
  if (!overlay) return null
  const isRegionSelect = overlay.variant === 'region-select'
  return (
    <div
      style={{
        position: 'absolute',
        left: overlay.rect.left,
        top: overlay.rect.top,
        width: overlay.rect.width,
        height: overlay.rect.height,
        boxSizing: 'border-box',
        border: isRegionSelect
          ? '1px solid rgba(232, 180, 184, 0.95)'
          : '1px solid rgba(59, 130, 246, 0.9)',
        background: isRegionSelect
          ? 'rgba(232, 180, 184, 0.22)'
          : 'rgba(59, 130, 246, 0.12)',
        pointerEvents: 'none',
      }}
    />
  )
}
