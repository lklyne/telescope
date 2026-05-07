/**
 * GroupRenameLabel — group name + rename trigger rendered in aboveView.
 * Per ADR 0002 §2 the label sits above each group's bounds and is
 * `data-overlay-ui` so the canvas-pointer-router yields. Group bounds
 * (the bordered rect itself) keep rendering in canvas-bg via
 * `GroupBoundsLayer` — only the rename label moves.
 */

import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import type {
  CanvasBgElectronAPI,
  CanvasSceneGroupEntity,
  LayoutUpdateData,
} from '../../shared/types'
import { resolveCanvasColor } from '../../shared/canvas-colors'
import { InlineEditLabel } from '../shared/InlineEditLabel'

const GROUP_DRAG_THRESHOLD = 4

export function GroupRenameOverlay({
  api,
  layoutData,
  isDark,
}: {
  api: CanvasBgElectronAPI
  layoutData: LayoutUpdateData
  isDark: boolean
}) {
  if (layoutData.viewMode !== 'canvas') return null
  const groups = layoutData.groups ?? []
  if (!groups.length) return null
  return (
    <>
      {groups.map((group) => (
        <GroupRenameItem
          key={group.id}
          api={api}
          layoutData={layoutData}
          group={group}
          isDark={isDark}
        />
      ))}
    </>
  )
}

function GroupRenameItem({
  api,
  layoutData,
  group,
  isDark,
}: {
  api: CanvasBgElectronAPI
  layoutData: LayoutUpdateData
  group: CanvasSceneGroupEntity
  isDark: boolean
}) {
  const [isRenaming, setIsRenaming] = useState(false)
  const labelColorClass = group.color
    ? isDark ? 'text-zinc-100' : 'text-zinc-900'
    : isDark ? 'text-zinc-300' : 'text-zinc-700'
  const iconColorClass = group.color
    ? isDark ? 'text-zinc-300' : 'text-zinc-600'
    : 'text-zinc-500'
  // The label sits above group.screenY and inside aboveView's overlay-local
  // coordinate space; subtract canvasOrigin.y to drop into overlay coords.
  const left = group.screenX
  const top = group.screenY - layoutData.canvasOrigin.y
  // Suppress per-frame React thinks-unused warning by referencing the resolved
  // colour for future styling extension; today we lean on existing tokens.
  void resolveCanvasColor

  const onMouseDown = isRenaming
    ? (event: React.MouseEvent) => event.stopPropagation()
    : (event: React.MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        const additive = event.shiftKey || event.metaKey || event.ctrlKey
        if (additive) {
          api.selectGroup(group.id)
          return
        }
        let dragging = false
        const startX = event.screenX
        const startY = event.screenY
        let lastX = startX
        let lastY = startY
        const onMove = (ev: MouseEvent) => {
          const totalDx = ev.screenX - startX
          const totalDy = ev.screenY - startY
          if (
            !dragging &&
            Math.abs(totalDx) < GROUP_DRAG_THRESHOLD &&
            Math.abs(totalDy) < GROUP_DRAG_THRESHOLD
          ) {
            return
          }
          if (!dragging) {
            dragging = true
            api.startDragGroup(group.id)
          }
          const dx = ev.screenX - lastX
          const dy = ev.screenY - lastY
          lastX = ev.screenX
          lastY = ev.screenY
          if (dx !== 0 || dy !== 0) api.dragGroup(group.id, dx, dy)
        }
        const cleanup = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          window.removeEventListener('blur', onCancel)
        }
        const onUp = () => {
          cleanup()
          if (dragging) {
            api.endDragGroup()
            return
          }
          api.selectGroup(group.id)
        }
        const onCancel = () => {
          cleanup()
          if (dragging) api.endDragGroup()
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        window.addEventListener('blur', onCancel)
      }

  return (
    <div
      data-overlay-ui
      className={`pointer-events-auto absolute select-none text-[11px] font-medium ${labelColorClass}`}
      style={{
        left,
        top,
        transform: 'translateY(-100%)',
        whiteSpace: 'nowrap',
        cursor: isRenaming ? 'text' : 'grab',
      }}
      onMouseDown={onMouseDown}
      onDoubleClick={() => setIsRenaming(true)}
    >
      <span className="inline-flex items-center gap-1 pb-1">
        <FolderOpen size={14} className={`shrink-0 ${iconColorClass}`} />
        <InlineEditLabel
          value={group.label}
          isEditing={isRenaming}
          onStartEdit={() => setIsRenaming(true)}
          onCommit={(next) => {
            setIsRenaming(false)
            api.renameGroup(group.id, next)
          }}
          onCancel={() => setIsRenaming(false)}
          variant="canvas-chrome"
          isDark={isDark}
          titleClassName="min-w-0 truncate"
          inputClassName="min-w-[120px] border-0 bg-transparent text-[11px] font-medium outline-none focus:outline-none"
        />
      </span>
    </div>
  )
}
