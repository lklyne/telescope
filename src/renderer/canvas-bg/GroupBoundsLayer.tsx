import { memo, useRef } from 'react'
import type { CanvasSceneGroupEntity } from '../../shared/types'
import { resolveCanvasColor } from '../../shared/canvas-colors'
import { selectionColor } from './canvasBgConstants'
import { useGroupDragGesture } from './useGroupBoundsDrag'

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

export const GroupBoundsLayer = memo(function GroupBoundsLayer({
  groups,
  isDark,
  zoom,
  onSelectGroup,
  onStartDragGroup,
  onDragGroup,
  onEndDragGroup,
  onDoubleClick,
}: {
  groups: CanvasSceneGroupEntity[]
  isDark: boolean
  selectedGroupId: string | null
  zoom: number
  onSelectGroup: (groupId: string) => void
  onStartDragGroup: (groupId: string) => void
  onDragGroup: (groupId: string, dx: number, dy: number) => void
  onEndDragGroup: () => void
  onDoubleClick: (groupId: string) => void
}) {
  if (!groups.length) return null
  const inverseScale = 1 / zoom

  return (
    <>
      {groups.map((group) => (
        <GroupBoundsItem
          key={group.id}
          group={group}
          isDark={isDark}
          inverseScale={inverseScale}
          onSelectGroup={onSelectGroup}
          onStartDragGroup={onStartDragGroup}
          onDragGroup={onDragGroup}
          onEndDragGroup={onEndDragGroup}
          onDoubleClick={onDoubleClick}
        />
      ))}
    </>
  )
})

function GroupBoundsItem({
  group,
  isDark,
  inverseScale,
  onSelectGroup,
  onStartDragGroup,
  onDragGroup,
  onEndDragGroup,
  onDoubleClick,
}: {
  group: CanvasSceneGroupEntity
  isDark: boolean
  inverseScale: number
  onSelectGroup: (groupId: string) => void
  onStartDragGroup: (groupId: string) => void
  onDragGroup: (groupId: string, dx: number, dy: number) => void
  onEndDragGroup: () => void
  onDoubleClick: (groupId: string) => void
}) {
  const dragRef = useRef<HTMLDivElement>(null)
  const surfaceStyle = groupSurfaceStyle(group, isDark, false)

  useGroupDragGesture({
    target: dragRef,
    groupId: group.id,
    enabled: true,
    selectOnPointerDown: true,
    onSelectGroup,
    onStartDragGroup,
    onDragGroup,
    onEndDragGroup,
  })

  return (
    <div
      ref={dragRef}
      className="absolute"
      style={{
        left: group.canvasX,
        top: group.canvasY,
        width: group.width,
        height: group.height,
        overflow: 'visible',
        pointerEvents: 'none',
        touchAction: 'none',
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
        onDoubleClick={() => onDoubleClick(group.id)}
      />
    </div>
  )
}

