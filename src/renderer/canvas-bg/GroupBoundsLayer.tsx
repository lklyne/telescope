import { memo, useRef, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import type { CanvasSceneGroupEntity } from '../../shared/types'
import { resolveCanvasColor } from '../../shared/canvas-colors'
import { InlineEditLabel } from '../shared/InlineEditLabel'
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
      labelColor: isDark ? 'text-zinc-300' : 'text-zinc-700',
      iconColor: 'text-zinc-500',
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
    labelColor: isDark ? 'text-zinc-100' : 'text-zinc-900',
    iconColor: isDark ? 'text-zinc-300' : 'text-zinc-600',
  }
}

export const GroupBoundsLayer = memo(function GroupBoundsLayer({
  groups,
  isDark,
  selectedGroupId,
  zoom,
  onSelectGroup,
  onStartDragGroup,
  onDragGroup,
  onEndDragGroup,
  onDoubleClick,
  onRenameGroup,
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
  onRenameGroup: (groupId: string, name: string) => void
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
          isSelected={group.id === selectedGroupId}
          inverseScale={inverseScale}
          onSelectGroup={onSelectGroup}
          onStartDragGroup={onStartDragGroup}
          onDragGroup={onDragGroup}
          onEndDragGroup={onEndDragGroup}
          onDoubleClick={onDoubleClick}
          onRenameGroup={onRenameGroup}
        />
      ))}
    </>
  )
})

function GroupBoundsItem({
  group,
  isDark,
  isSelected,
  inverseScale,
  onSelectGroup,
  onStartDragGroup,
  onDragGroup,
  onEndDragGroup,
  onDoubleClick,
  onRenameGroup,
}: {
  group: CanvasSceneGroupEntity
  isDark: boolean
  isSelected: boolean
  inverseScale: number
  onSelectGroup: (groupId: string) => void
  onStartDragGroup: (groupId: string) => void
  onDragGroup: (groupId: string, dx: number, dy: number) => void
  onEndDragGroup: () => void
  onDoubleClick: (groupId: string) => void
  onRenameGroup: (groupId: string, name: string) => void
}) {
  const dragRef = useRef<HTMLDivElement>(null)
  const [isHeaderHovered, setIsHeaderHovered] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const surfaceStyle = groupSurfaceStyle(group, isDark, isHeaderHovered)

  useGroupDragGesture({
    target: dragRef,
    groupId: group.id,
    enabled: !isRenaming,
    selectOnPointerDown: true,
    onSelectGroup,
    onStartDragGroup,
    onDragGroup,
    onEndDragGroup,
    filter: (event) => {
      const target = event.target as HTMLElement | null
      return Boolean(target?.closest('[data-group-drag-handle]'))
    },
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
        onDoubleClick={() => {
          if (isSelected) onDoubleClick(group.id)
        }}
      />
      <span
        className={`absolute select-none text-[11px] font-medium ${surfaceStyle.labelColor}`}
        data-group-drag-handle
        style={{
          top: -20 * inverseScale,
          left: 0,
          whiteSpace: 'nowrap',
          cursor: isRenaming ? 'text' : 'grab',
          pointerEvents: 'auto',
          transformOrigin: 'top left',
          transform: `scale(${inverseScale})`,
        }}
        onClick={(event) => {
          if (isRenaming) return
          event.stopPropagation()
          onSelectGroup(group.id)
        }}
        onMouseEnter={() => setIsHeaderHovered(true)}
        onMouseLeave={() => setIsHeaderHovered(false)}
        onMouseDown={isRenaming ? (event) => event.stopPropagation() : undefined}
      >
        <span className="inline-flex items-center gap-1">
          <FolderOpen
            size={14}
            className={`shrink-0 ${surfaceStyle.iconColor}`}
          />
          <InlineEditLabel
            value={group.label}
            isEditing={isRenaming}
            onStartEdit={() => setIsRenaming(true)}
            onCommit={(next) => {
              setIsRenaming(false)
              onRenameGroup(group.id, next)
            }}
            onCancel={() => setIsRenaming(false)}
            variant="canvas-chrome"
            isDark={isDark}
            titleClassName="min-w-0 truncate"
            inputClassName="min-w-[120px] border-0 bg-transparent text-[11px] font-medium outline-none focus:outline-none"
          />
        </span>
      </span>
    </div>
  )
}
