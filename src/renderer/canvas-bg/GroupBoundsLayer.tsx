import { memo, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import type { CanvasSceneGroupEntity } from '../../shared/types'
import { resolveCanvasColor } from '../../shared/canvas-colors'
import { SelectableEntityShell } from './SelectableEntityShell'
import { InlineEditLabel } from '../shared/InlineEditLabel'
import type { EntityResizePatch } from './entityConstants'

function groupSurfaceStyle(group: CanvasSceneGroupEntity, isDark: boolean) {
  if (!group.color) {
    return {
      borderColor: isDark ? 'rgba(161,161,170,0.25)' : 'rgba(113,113,122,0.25)',
      background: isDark ? 'rgba(39,39,42,0.35)' : 'rgba(244,244,245,0.45)',
      labelColor: isDark ? 'text-zinc-300' : 'text-zinc-700',
      iconColor: 'text-zinc-500',
    }
  }

  const resolvedColor = resolveCanvasColor(group.color)
  return {
    borderColor: isDark
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
  onResize,
  onPointerDown,
  onDoubleClick,
  onRenameGroup,
}: {
  groups: CanvasSceneGroupEntity[]
  isDark: boolean
  selectedGroupId: string | null
  zoom: number
  onResize: (id: string, patch: EntityResizePatch) => void
  onPointerDown: (groupId: string, e: React.PointerEvent) => void
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
          zoom={zoom}
          onResize={onResize}
          onPointerDown={onPointerDown}
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
  zoom,
  onResize,
  onPointerDown,
  onDoubleClick,
  onRenameGroup,
}: {
  group: CanvasSceneGroupEntity
  isDark: boolean
  isSelected: boolean
  inverseScale: number
  zoom: number
  onResize: (id: string, patch: EntityResizePatch) => void
  onPointerDown: (groupId: string, e: React.PointerEvent) => void
  onDoubleClick: (groupId: string) => void
  onRenameGroup: (groupId: string, name: string) => void
}) {
  const surfaceStyle = groupSurfaceStyle(group, isDark)
  const [isRenaming, setIsRenaming] = useState(false)

  return (
    <SelectableEntityShell
      id={group.id}
      canvasX={group.canvasX}
      canvasY={group.canvasY}
      width={group.width}
      height={group.height}
      getZoom={() => zoom}
      minWidth={120}
      minHeight={80}
      isDark={isDark}
      isSelected={isSelected}
      isMarqueePreview={false}
      background="transparent"
      borderRadius={2 * inverseScale}
      overflowVisible
      showResizeHandles={false}
      onSelect={() => undefined}
      onResize={onResize}
      onDragStart={() => undefined}
      onDrag={() => undefined}
      onDragEnd={() => undefined}
      shouldStartDrag={() => false}
    >
      <div
        className="absolute inset-0"
        style={{
          borderRadius: 2 * inverseScale,
          border: `${1.5 * inverseScale}px solid ${surfaceStyle.borderColor}`,
          background: surfaceStyle.background,
        }}
        onMouseDown={(event) => {
          event.stopPropagation()
          onPointerDown(group.id, event as unknown as React.PointerEvent)
        }}
        onDoubleClick={() => onDoubleClick(group.id)}
      >
        <span
          className={`absolute select-none text-[11px] font-medium ${surfaceStyle.labelColor}`}
          style={{
            top: -20 * inverseScale,
            left: 0,
            whiteSpace: 'nowrap',
            cursor: isRenaming ? 'text' : 'grab',
            transformOrigin: 'top left',
            transform: `scale(${inverseScale})`,
          }}
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
    </SelectableEntityShell>
  )
}
