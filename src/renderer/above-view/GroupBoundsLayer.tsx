/**
 * GroupBoundsLayer — group bound rectangles, rendered in aboveView
 * (Phase F of the aboveView migration).
 *
 * The previous implementation lived in `canvas-bg/GroupBoundsLayer.tsx`,
 * where the group-bound rectangle painted under the page WCVs. A group
 * that contains a frame had its border clipped by the page above. The
 * layer now mounts in aboveView so the bound is visible above frames.
 *
 * Purely visual (`pointer-events: none` end-to-end) — selection / drag /
 * double-click-to-enter-group are all driven by `useCanvasPointerRouter`
 * against the layout snapshot, not by direct DOM events on this surface.
 */
import { memo } from 'react'
import type { CanvasSceneGroupEntity } from '../../shared/types'
import { resolveCanvasColor } from '../../shared/canvas-colors'
import { selectionColor } from '../canvas-bg/canvasBgConstants'

function groupSurfaceStyle(
  group: CanvasSceneGroupEntity,
  isDark: boolean,
  highlighted: boolean,
) {
  if (!group.color) {
    return {
      borderColor: highlighted
        ? selectionColor(isDark)
        : isDark ? 'rgba(161,161,170,0.25)' : 'rgba(113,113,122,0.25)',
      background: isDark ? 'rgba(39,39,42,0.35)' : 'rgba(244,244,245,0.45)',
    }
  }

  const resolvedColor = resolveCanvasColor(group.color)
  return {
    borderColor: highlighted
      ? selectionColor(isDark)
      : isDark
        ? `color-mix(in srgb, ${resolvedColor} 72%, #f4f4f5)`
        : `color-mix(in srgb, ${resolvedColor} 78%, #a16207)`,
    background: `color-mix(in srgb, ${resolvedColor} ${isDark ? '20%' : '30%'}, transparent)`,
  }
}

/**
 * Wraps the group-bound rectangles in a viewport transform so they live in
 * canvas-coordinate space. AboveView's WCV origin already sits at
 * `canvasOrigin.y` (the toolbar inset), so the translate omits that axis
 * — only `canvasOrigin.x` and `pan` apply. Matches `StickyViewportLayer`.
 */
function GroupViewportLayer({
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
        transform: `translate(${canvasOrigin.x + pan.x}px, ${pan.y}px) scale(${zoom})`,
      }}
    >
      {children}
    </div>
  )
}

export const GroupBoundsLayer = memo(function GroupBoundsLayer({
  groups,
  isDark,
  zoom,
  canvasOrigin,
  pan,
}: {
  groups: CanvasSceneGroupEntity[]
  isDark: boolean
  zoom: number
  canvasOrigin: { x: number; y: number }
  pan: { x: number; y: number }
}) {
  if (!groups.length) return null
  const inverseScale = 1 / zoom

  return (
    <GroupViewportLayer canvasOrigin={canvasOrigin} pan={pan} zoom={zoom}>
      {groups.map((group) => (
        <GroupBoundsItem
          key={group.id}
          group={group}
          isDark={isDark}
          inverseScale={inverseScale}
        />
      ))}
    </GroupViewportLayer>
  )
})

function GroupBoundsItem({
  group,
  isDark,
  inverseScale,
}: {
  group: CanvasSceneGroupEntity
  isDark: boolean
  inverseScale: number
}) {
  const surfaceStyle = groupSurfaceStyle(group, isDark, false)

  return (
    <div
      className="absolute"
      style={{
        left: group.canvasX,
        top: group.canvasY,
        width: group.width,
        height: group.height,
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          borderRadius: 2 * inverseScale,
          border: `${1.5 * inverseScale}px solid ${surfaceStyle.borderColor}`,
          background: surfaceStyle.background,
          transition: 'border-color 120ms ease',
        }}
      />
    </div>
  )
}
