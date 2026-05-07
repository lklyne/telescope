import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CanvasBgElectronAPI,
  CanvasSceneFileEntity,
  CanvasSceneFrameEntity,
  CanvasSceneTextEntity,
  LayoutUpdateData,
  ThemeData,
} from '../../shared/types'
import { useCanvasGlobalShortcuts } from '../shared/hooks/useCanvasGlobalShortcuts'
import { useReportTextEditing } from '../shared/hooks/useReportTextEditing'
import { useTheme } from '../shared/hooks/useTheme'
import { DRAW_CURSOR } from './canvasBgConstants'
import { CanvasDebugBadge, CanvasGridSurface, PlacementPreviewLayer, CanvasEntityViewportLayer } from './CanvasGridSurface'
import { BrowserTabBar } from './BrowserTabBar'
import { DeviceShellLayer } from './DeviceShellLayer'
import { FrameBorderLayer } from './FrameBorderLayer'
import { SvgDeviceShellLayer } from './SvgDeviceShellLayer'
import { GroupBoundsLayer } from './GroupBoundsLayer'
import { ActiveFrameHighlightLayer } from './AgentCursorLayer'
import { GroupInlineMenu, StickyNoteInlineMenu } from './InlineEntityMenu'
import { useCanvasLayoutState } from './useCanvasLayoutState'
import { usePendingPlacementState } from './usePendingPlacementState'
import { useCanvasViewportGestures, type ShapePlacementDragPreview } from './useCanvasViewportGestures'
import { SELECTED_FRAME_MENU_SHOW_DELAY_MS } from '../../shared/selectedFrameMenu'

const api = (window as unknown as { electronAPI: CanvasBgElectronAPI }).electronAPI
const GROUP_MENU_DELAY_MS = 150

export default function App({
  initialLayoutData,
  initialTheme,
}: {
  initialLayoutData: LayoutUpdateData
  initialTheme: ThemeData
}) {
  const isDev =
    ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ??
      false) === true
  const bgRef = useRef<HTMLDivElement>(null)
  const isDark = useTheme(initialTheme, api.onThemeChanged)
  useReportTextEditing(api.setTextEditing)
  const { layoutData, layoutRef, layoutTick } = useCanvasLayoutState({ api, initialLayoutData })
  const { pendingPlacementPreview, setPlacementCursor } =
    usePendingPlacementState(layoutData)
  const [shapePlacementPreview, setShapePlacementPreview] =
    useState<ShapePlacementDragPreview | null>(null)
  const [captureMode, setCaptureMode] = useState(false)
  useEffect(() => api.onCaptureMode(setCaptureMode), [])

  useCanvasViewportGestures({
    api,
    bgRef,
    layoutRef,
    setPlacementCursor,
    onShapePlacementPreview: setShapePlacementPreview,
  })

  useCanvasGlobalShortcuts({
    api,
    layoutRef,
  })

  const frameEntities = useMemo(
    () => layoutData.entities.filter((e): e is CanvasSceneFrameEntity => e.kind === 'frame'),
    [layoutData.entities],
  )
  const textEntities = useMemo(
    () => layoutData.entities.filter((e): e is CanvasSceneTextEntity => e.kind === 'text'),
    [layoutData.entities],
  )
  const fileEntities = useMemo(
    () => layoutData.entities.filter((e): e is CanvasSceneFileEntity => e.kind === 'file'),
    [layoutData.entities],
  )
  const borderFrames = useMemo(
    () => layoutData.viewMode === 'browser'
      ? frameEntities.filter((f) => f.id === layoutData.activeBrowserTabId)
      : frameEntities,
    [frameEntities, layoutData.viewMode, layoutData.activeBrowserTabId],
  )
  const selectedGroupEntity = useMemo(() => {
    if (!layoutData.selectedGroupId) return null
    return (layoutData.groups ?? []).find((group) => group.id === layoutData.selectedGroupId) ?? null
  }, [layoutData.groups, layoutData.selectedGroupId])
  const selectedTextEntity = useMemo(() => {
    if (layoutData.selectedEntityIds.length !== 1) return null
    const [selectedId] = layoutData.selectedEntityIds
    return textEntities.find((entity) => entity.id === selectedId) ?? null
  }, [layoutData.selectedEntityIds, textEntities])
  const [delayedSelectedTextMenuId, setDelayedSelectedTextMenuId] = useState<string | null>(null)
  const [delayedSelectedGroupMenuId, setDelayedSelectedGroupMenuId] = useState<string | null>(null)
  const shouldQueueSelectedTextMenu =
    layoutData.viewMode === 'canvas' &&
    layoutData.interaction.kind === 'idle' &&
    selectedTextEntity !== null
  useEffect(() => {
    if (!shouldQueueSelectedTextMenu || !selectedTextEntity) {
      setDelayedSelectedTextMenuId(null)
      return
    }

    const timeoutId = window.setTimeout(() => {
      setDelayedSelectedTextMenuId(selectedTextEntity.id)
    }, SELECTED_FRAME_MENU_SHOW_DELAY_MS)

    return () => window.clearTimeout(timeoutId)
  }, [selectedTextEntity, shouldQueueSelectedTextMenu])
  const shouldQueueSelectedGroupMenu =
    layoutData.viewMode === 'canvas' &&
    layoutData.interaction.kind === 'idle' &&
    selectedGroupEntity !== null
  useEffect(() => {
    if (!shouldQueueSelectedGroupMenu || !selectedGroupEntity) {
      setDelayedSelectedGroupMenuId(null)
      return
    }

    const timeoutId = window.setTimeout(() => {
      setDelayedSelectedGroupMenuId(selectedGroupEntity.id)
    }, GROUP_MENU_DELAY_MS)

    return () => window.clearTimeout(timeoutId)
  }, [selectedGroupEntity, shouldQueueSelectedGroupMenu])
  const showSelectedTextMenu =
    selectedTextEntity !== null && delayedSelectedTextMenuId === selectedTextEntity.id
  const showSelectedGroupMenu =
    selectedGroupEntity !== null && delayedSelectedGroupMenuId === selectedGroupEntity.id

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{
        cursor: layoutData.annotationMode === 'draw' ? DRAW_CURSOR : undefined,
      }}
    >
      <CanvasDebugBadge
        annotationCount={layoutData.annotations.length}
        annotationMode={layoutData.annotationMode}
        isDev={isDev}
        layoutTick={layoutTick}
      />
      <CanvasGridSurface
        bgRef={bgRef}
        isDark={isDark}
        canvasOrigin={layoutData.canvasOrigin}
        pan={layoutData.pan}
        zoom={layoutData.zoom}
      />
      {!captureMode ? (
        <>
          <PlacementPreviewLayer
            isDark={isDark}
            preview={shapePlacementPreview ? null : pendingPlacementPreview}
          />
          {shapePlacementPreview &&
          shapePlacementPreview.rect.width > 0 &&
          shapePlacementPreview.rect.height > 0 ? (
            <PlacementPreviewLayer
              isDark={isDark}
              preview={{
                entityKind: 'shape',
                shapeKind: shapePlacementPreview.shapeKind,
                left: shapePlacementPreview.rect.left,
                top: shapePlacementPreview.rect.top,
                width: shapePlacementPreview.rect.width,
                height: shapePlacementPreview.rect.height,
              }}
            />
          ) : null}
        </>
      ) : null}

      {layoutData.viewMode === 'canvas' && (layoutData.groups?.length ?? 0) > 0 ? (
        <CanvasEntityViewportLayer
          canvasOrigin={layoutData.canvasOrigin}
          pan={layoutData.pan}
          zoom={layoutData.zoom}
        >
          <GroupBoundsLayer
            groups={layoutData.groups ?? []}
            isDark={isDark}
            selectedGroupId={layoutData.selectedGroupId ?? null}
            zoom={layoutData.zoom}
            onSelectGroup={api.selectGroup}
            onStartDragGroup={api.startDragGroup}
            onDragGroup={api.dragGroup}
            onEndDragGroup={api.endDragGroup}
            onDoubleClick={(groupId) => {
              api.enterGroup(groupId)
            }}
          />
        </CanvasEntityViewportLayer>
      ) : null}

      {layoutData.viewMode === 'browser' ? (
        <BrowserTabBar
          activeBrowserTabId={layoutData.activeBrowserTabId}
          leftInset={layoutData.leftChromeWidth}
          browserTabs={layoutData.browserTabs}
          isDark={isDark}
          onAddBrowserFrame={api.addBrowserFrame}
          onDeleteFrame={api.deleteFrame}
          onRenameFrame={api.renameFrame}
          onSelectBrowserTab={api.selectBrowserTab}
        />
      ) : null}

      <div className="pointer-events-none absolute inset-0">
        {layoutData.viewMode === 'canvas' && layoutData.presenceCursors.length > 0 ? (
          <ActiveFrameHighlightLayer
            cursors={layoutData.presenceCursors}
            frames={frameEntities}
          />
        ) : null}

        <FrameBorderLayer
          frames={borderFrames}
          fileEntities={layoutData.viewMode === 'browser' ? [] : fileEntities}
          focusedFrameId={layoutData.keyboardTargetFrameId}
        />
        <DeviceShellLayer
          frames={borderFrames.filter((f) => !f.useSvgDeviceShell)}
          fileEntities={layoutData.viewMode === 'browser' ? [] : fileEntities}
          isDark={isDark}
        />
        <SvgDeviceShellLayer
          frames={borderFrames.filter((f) => f.useSvgDeviceShell)}
          isDark={isDark}
        />
      </div>

      {showSelectedTextMenu ? (
        selectedTextEntity ? (
          <StickyNoteInlineMenu
            isDark={isDark}
            note={selectedTextEntity}
            onDuplicate={() => api.duplicateTextEntity(selectedTextEntity.id)}
            onDelete={() => api.deleteTextEntity(selectedTextEntity.id)}
            onSelectColor={(color) => api.updateTextEntity(selectedTextEntity.id, { color })}
          />
        ) : null
      ) : null}

      {showSelectedGroupMenu ? (
        selectedGroupEntity ? (
          <GroupInlineMenu
            group={selectedGroupEntity}
            isDark={isDark}
            onDuplicate={() => api.duplicateGroup(selectedGroupEntity.id)}
            onDelete={() => api.deleteGroup(selectedGroupEntity.id)}
            onSelectColor={(color) => api.updateGroupEntity(selectedGroupEntity.id, { color })}
          />
        ) : null
      ) : null}

      {/* Selected frame menu now renders in the floating-ui view (above frames) */}
    </div>
  )
}
