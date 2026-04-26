import { memo } from 'react'
import { ContextMenu } from '@base-ui/react/context-menu'
import { Menu } from '@base-ui/react/menu'
import type { CanvasSceneFileEntity, SelectionModifiers } from '../../shared/types'
import { SelectableEntityShell } from './SelectableEntityShell'
import {
  aspectRatioResizeModeForCanvasFile,
  type EntityResizePatch,
  MIN_FILE_HEIGHT,
  MIN_FILE_WIDTH,
} from './entityConstants'
import {
  RendererSwitch,
  rendererSuppressesContentDrag,
} from './entity-renderers/RendererSwitch'
import { getFileApi } from './entity-renderers/filePathToSrc'

function FileBlockCard({
  entity,
  getZoom,
  isDark,
  isSelected,
  isMarqueePreview,
  canEdit,
  wireframeJsonMode,
  onSelect,
  onResize,
  onTextEditingChange,
  onDragStart,
  onDrag,
  onDragEnd,
  selectedGroupDragTargetId,
  onGroupDragStart,
  onGroupDrag,
  onGroupDragEnd,
}: {
  entity: CanvasSceneFileEntity
  getZoom: () => number
  isDark: boolean
  isSelected: boolean
  isMarqueePreview: boolean
  canEdit: boolean
  wireframeJsonMode: boolean
  onSelect: (id: string, modifiers?: SelectionModifiers) => void
  onResize: (id: string, patch: EntityResizePatch) => void
  onTextEditingChange: (active: boolean) => void
  onDragStart: (id: string) => void
  onDrag: (id: string, dx: number, dy: number) => void
  onDragEnd: () => void
  selectedGroupDragTargetId?: string | null
  onGroupDragStart: (groupId: string) => void
  onGroupDrag: (groupId: string, dx: number, dy: number) => void
  onGroupDragEnd: () => void
}) {
  const fileApi = getFileApi()

  const menuPopupClass = `z-50 min-w-40 rounded-[10px] border p-1 shadow-xl outline-none ${
    isDark
      ? 'border-zinc-700 bg-zinc-900 text-zinc-100'
      : 'border-zinc-200 bg-white text-zinc-900'
  }`
  const menuItemClass = `flex cursor-default items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-xs outline-none ${
    isDark
      ? 'text-zinc-100 data-[highlighted]:bg-zinc-800'
      : 'text-zinc-900 data-[highlighted]:bg-zinc-100'
  }`

  return (
    <SelectableEntityShell
      id={entity.id}
      canvasX={entity.canvasX}
      canvasY={entity.canvasY}
      width={entity.width}
      height={entity.height}
      getZoom={getZoom}
      minWidth={MIN_FILE_WIDTH}
      minHeight={MIN_FILE_HEIGHT}
      isDark={isDark}
      isSelected={isSelected}
      isMarqueePreview={isMarqueePreview}
      background={entity.showDeviceFrame ? 'transparent' : isDark ? '#1c1917' : '#fafaf9'}
      borderRadius={entity.showDeviceFrame ? 0 : 4}
      showCardShadow={!entity.showDeviceFrame}
      onSelect={onSelect}
      onResize={onResize}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      selectedGroupDragTargetId={selectedGroupDragTargetId}
      onGroupDragStart={onGroupDragStart}
      onGroupDrag={onGroupDrag}
      onGroupDragEnd={onGroupDragEnd}
      aspectRatioResizeMode={aspectRatioResizeModeForCanvasFile(entity.file)}
      shouldStartDrag={(event) => {
        if (canEdit && rendererSuppressesContentDrag(entity)) return false
        const target = event.target as HTMLElement | null
        if (target?.closest('button, textarea, input')) return false
        return true
      }}
    >
      <ContextMenu.Root>
        <ContextMenu.Trigger className="block" style={{ width: '100%', height: '100%' }}>
          <RendererSwitch
            entity={entity}
            canEdit={canEdit}
            isDark={isDark}
            wireframeJsonMode={wireframeJsonMode}
            onTextEditingChange={onTextEditingChange}
          />
        </ContextMenu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={6}>
            <Menu.Popup className={menuPopupClass}>
              <Menu.Item
                className={menuItemClass}
                onClick={() => fileApi.showFileInFinder(entity.file)}
              >
                Show in Finder
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </ContextMenu.Root>
    </SelectableEntityShell>
  )
}

const MemoFileBlockCard = memo(FileBlockCard, (prev, next) => {
  return (
    prev.entity.id === next.entity.id &&
    prev.entity.file === next.entity.file &&
    prev.entity.subpath === next.entity.subpath &&
    prev.entity.canvasX === next.entity.canvasX &&
    prev.entity.canvasY === next.entity.canvasY &&
    prev.entity.width === next.entity.width &&
    prev.entity.height === next.entity.height &&
    prev.entity.objectFit === next.entity.objectFit &&
    prev.entity.showDeviceFrame === next.entity.showDeviceFrame &&
    prev.entity.deviceId === next.entity.deviceId &&
    prev.entity.deviceOrientation === next.entity.deviceOrientation &&
    prev.entity.rendererTag === next.entity.rendererTag &&
    prev.isDark === next.isDark &&
    prev.isSelected === next.isSelected &&
    prev.isMarqueePreview === next.isMarqueePreview &&
    prev.canEdit === next.canEdit &&
    prev.wireframeJsonMode === next.wireframeJsonMode &&
    prev.selectedGroupDragTargetId === next.selectedGroupDragTargetId
  )
})

/** Map of entityId → jsonMode, shared between FileChromeLayer and FileBlockLayer. */
export type FileJsonModeMap = Map<string, boolean>

export function FileBlockLayer({
  entities,
  getZoom,
  isDark,
  marqueePreviewIds,
  selectedEntityIdSet,
  selectedEntityCount,
  selectedGroupId,
  selectedGroupDescendantIds,
  jsonModeMap,
  onSelect,
  onResize,
  onTextEditingChange,
  onDragStart,
  onDrag,
  onDragEnd,
  onGroupDragStart,
  onGroupDrag,
  onGroupDragEnd,
}: {
  entities: CanvasSceneFileEntity[]
  getZoom: () => number
  isDark: boolean
  marqueePreviewIds: Set<string> | null
  selectedEntityIdSet: Set<string>
  selectedEntityCount: number
  selectedGroupId: string | null
  selectedGroupDescendantIds: Set<string>
  jsonModeMap: FileJsonModeMap
  onSelect: (id: string, modifiers?: SelectionModifiers) => void
  onResize: (id: string, patch: EntityResizePatch) => void
  onTextEditingChange: (active: boolean) => void
  onDragStart: (id: string) => void
  onDrag: (id: string, dx: number, dy: number) => void
  onDragEnd: () => void
  onGroupDragStart: (groupId: string) => void
  onGroupDrag: (groupId: string, dx: number, dy: number) => void
  onGroupDragEnd: () => void
}) {
  if (!entities.length) return null
  return (
    <>
      {entities.map((entity) => (
        <MemoFileBlockCard
          key={entity.id}
          getZoom={getZoom}
          isDark={isDark}
          isSelected={selectedEntityIdSet.has(entity.id)}
          isMarqueePreview={marqueePreviewIds?.has(entity.id) ?? false}
          canEdit={selectedEntityIdSet.has(entity.id) && selectedEntityCount === 1}
          wireframeJsonMode={jsonModeMap.get(entity.id) ?? false}
          entity={entity}
          selectedGroupDragTargetId={
            selectedGroupId && selectedGroupDescendantIds.has(entity.id)
              ? selectedGroupId
              : null
          }
          onDrag={onDrag}
          onDragEnd={onDragEnd}
          onDragStart={onDragStart}
          onGroupDrag={onGroupDrag}
          onGroupDragEnd={onGroupDragEnd}
          onGroupDragStart={onGroupDragStart}
          onResize={onResize}
          onSelect={onSelect}
          onTextEditingChange={onTextEditingChange}
        />
      ))}
    </>
  )
}
