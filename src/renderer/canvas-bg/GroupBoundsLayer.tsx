import { memo } from 'react'
import { FolderOpen } from 'lucide-react'
import type { CanvasSceneGroupEntity } from '../../shared/types'
import { resolveCanvasColor } from '../../shared/canvas-colors'
import { SelectableEntityShell } from './SelectableEntityShell'
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
}: {
  groups: CanvasSceneGroupEntity[]
  isDark: boolean
  selectedGroupId: string | null
  zoom: number
  onResize: (id: string, patch: EntityResizePatch) => void
  onPointerDown: (groupId: string, e: React.PointerEvent) => void
  onDoubleClick: (groupId: string) => void
}) {
  if (!groups.length) return null
  const inverseScale = 1 / zoom

  return (
    <>
      {groups.map((group) => {
        const isSelected = group.id === selectedGroupId
        const surfaceStyle = groupSurfaceStyle(group, isDark)
        return (
          <SelectableEntityShell
            key={group.id}
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
                className={`absolute select-none text-[11px] font-medium ${
                  surfaceStyle.labelColor
                }`}
                style={{
                  top: -20 * inverseScale,
                  left: 0,
                  whiteSpace: 'nowrap',
                  cursor: 'grab',
                  transformOrigin: 'top left',
                  transform: `scale(${inverseScale})`,
                }}
              >
                <span className="inline-flex items-center gap-1">
                  <FolderOpen
                    size={14}
                    className={`shrink-0 ${surfaceStyle.iconColor}`}
                  />
                  <span>{group.label}</span>
                </span>
              </span>
            </div>
          </SelectableEntityShell>
        )
      })}
    </>
  )
})
