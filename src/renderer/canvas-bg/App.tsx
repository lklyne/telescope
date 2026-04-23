import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CanvasBgElectronAPI,
  CanvasSceneDrawingEntity,
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
import { buildSelectedFrameIdSet } from './canvasBgSelectors'
import { EntityHoverProvider } from './EntityHoverProvider'
import { CanvasDebugBadge, CanvasGridSurface, PlacementPreviewLayer, DragCopyPreviewLayer, CanvasEntityViewportLayer } from './CanvasGridSurface'
import { BrowserTabBar } from './BrowserTabBar'
import { CanvasSelectionOutlineLayer, GroupSelectionOverlayLayer } from './CanvasSelectionLayers'
import { DeviceShellLayer } from './DeviceShellLayer'
import { FrameBorderLayer } from './FrameBorderLayer'
import { SvgDeviceShellLayer } from './SvgDeviceShellLayer'
import { FrameChromeLayer } from './FrameChromeLayer'
import { TextBlockLayer } from './TextBlockLayer'
import { FileBlockLayer, type FileJsonModeMap } from './FileBlockLayer'
import { FileChromeLayer } from './FileChromeLayer'
import { GroupBoundsLayer } from './GroupBoundsLayer'
import { ActiveFrameHighlightLayer } from './AgentCursorLayer'
import { EdgeLayer } from './EdgeLayer'
import { GroupInlineMenu } from './InlineEntityMenu'
import { useCanvasLayoutState } from './useCanvasLayoutState'
import { usePendingPlacementState } from './usePendingPlacementState'
import { useCanvasViewportGestures } from './useCanvasViewportGestures'
import { useFrameChromeDrag } from './useFrameChromeDrag'
import { descendantIdsForGroup, selectedGroupHasDescendantFrame } from './groupMembership'

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
  const {
    chromeDraggingRef,
    dragCopyPreview,
    handleChromeMouseDown,
    syncChromeDragCopyMode,
  } = useFrameChromeDrag({
    api,
    layoutRef,
  })

  const [marqueePreviewIds, setMarqueePreviewIds] = useState<Set<string> | null>(null)
  const [fileJsonModeMap, setFileJsonModeMap] = useState<FileJsonModeMap>(() => new Map())
  const [captureMode, setCaptureMode] = useState(false)
  useEffect(() => api.onCaptureMode(setCaptureMode), [])

  useCanvasViewportGestures({
    api,
    bgRef,
    layoutRef,
    setPlacementCursor,
    onMarqueePreview: setMarqueePreviewIds,
  })

  useCanvasGlobalShortcuts({
    api,
    layoutRef,
    chromeDraggingRef,
    syncChromeDragCopyMode,
  })

  const handleSelectEdge = useCallback((edgeId: string | null) => api.selectEdge(edgeId), [api])
  const handleHoverEntity = useCallback((entityId: string | null) => api.hoverFrame(entityId), [api])

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
  const drawingEntities = useMemo(
    () => layoutData.entities.filter((e): e is CanvasSceneDrawingEntity => e.kind === 'drawing'),
    [layoutData.entities],
  )
  const borderFrames = useMemo(
    () => layoutData.viewMode === 'browser'
      ? frameEntities.filter((f) => f.id === layoutData.activeBrowserTabId)
      : frameEntities,
    [frameEntities, layoutData.viewMode, layoutData.activeBrowserTabId],
  )
  const selectedEntityIdSet = useMemo(
    () => buildSelectedFrameIdSet(layoutData.selectedEntityIds),
    [layoutData.selectedEntityIds],
  )
  const selectedGroupEntity = useMemo(() => {
    if (!layoutData.selectedGroupId) return null
    return (layoutData.groups ?? []).find((group) => group.id === layoutData.selectedGroupId) ?? null
  }, [layoutData.groups, layoutData.selectedGroupId])
  const selectedGroupDescendantIds = useMemo(() => {
    if (!layoutData.selectedGroupId) return new Set<string>()
    return descendantIdsForGroup(layoutData.groups ?? [], layoutData.selectedGroupId)
  }, [layoutData.groups, layoutData.selectedGroupId])
  const selectedGroupControlsMirroredToAboveView = useMemo(
    () => selectedGroupHasDescendantFrame(layoutData),
    [layoutData],
  )
  const [delayedSelectedGroupMenuId, setDelayedSelectedGroupMenuId] = useState<string | null>(null)
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
  const showSelectedGroupMenu =
    selectedGroupEntity !== null && delayedSelectedGroupMenuId === selectedGroupEntity.id
  const hoveredEntityId = layoutData.hover?.id ?? null
  const selectedEdgeId =
    layoutData.selection.find((target) => target.kind === 'edge')?.id ?? null
  const getEntityLayerZoom = useCallback(() => layoutRef.current.zoom, [layoutRef])
  const frameInteractionsEnabled = layoutData.annotationMode !== 'region_select'

  return (
    <EntityHoverProvider>
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
          <PlacementPreviewLayer isDark={isDark} preview={pendingPlacementPreview} />
          <DragCopyPreviewLayer dragCopyPreview={dragCopyPreview} isDark={isDark} />
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
            onRenameGroup={api.renameGroup}
          />
        </CanvasEntityViewportLayer>
      ) : null}

      {layoutData.viewMode === 'canvas' ? (
        <EdgeLayer
          edges={layoutData.edges}
          entities={layoutData.entities}
          hoveredEntityId={hoveredEntityId}
          isDark={isDark}
          interaction={layoutData.interaction}
          selectedEdgeId={selectedEdgeId}
          selectedEntityIds={layoutData.selectedEntityIds}
          zoom={layoutData.zoom}
          onBeginEdgeDrag={api.beginEdgeDrag}
          onCancelEdgeDrag={api.cancelEdgeDrag}
          onCommitEdgeDrag={api.commitEdgeDrag}
          onHoverEntity={handleHoverEntity}
          onSelectEdge={handleSelectEdge}
          onUpdateEdgeDragTarget={api.updateEdgeDragTarget}
        />
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
        {layoutData.viewMode === 'canvas' && !captureMode ? (
          <GroupSelectionOverlayLayer
            groups={layoutData.groups ?? []}
            isDark={isDark}
            selectedGroupId={layoutData.selectedGroupId ?? null}
            suppressOverlay={selectedGroupControlsMirroredToAboveView}
            onResizeGroup={(id, patch) => api.updateGroupEntity(id, patch)}
            onStartDragGroup={api.startDragGroup}
            onDragGroup={api.dragGroup}
            onEndDragGroup={api.endDragGroup}
          />
        ) : null}

        {layoutData.viewMode === 'canvas' && layoutData.presenceCursors.length > 0 ? (
          <ActiveFrameHighlightLayer
            cursors={layoutData.presenceCursors}
            frames={frameEntities}
          />
        ) : null}

        <FrameBorderLayer
          frames={borderFrames}
          fileEntities={layoutData.viewMode === 'browser' ? [] : fileEntities}
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

        {layoutData.viewMode === 'canvas' ? (
          <FrameChromeLayer
            frames={frameEntities}
            dragEnabled={frameInteractionsEnabled}
            isDark={isDark}
            selectedFrameId={layoutData.selectedEntityIds.length === 1 ? layoutData.selectedEntityIds[0] : null}
            hoveredFrameId={hoveredEntityId}
            isIdle={layoutData.interaction.kind === 'idle'}
            handleChromeMouseDown={handleChromeMouseDown}
            onHoverFrame={handleHoverEntity}
            onNavigateFrame={api.navigateFrame}
            onGoBackFrame={api.goBackFrame}
            onGoForwardFrame={api.goForwardFrame}
            onReloadFrame={api.reloadFrame}
            onShowContextMenu={api.showFrameContextMenu}
          />
        ) : null}

        {layoutData.viewMode === 'canvas' ? (
          <FileChromeLayer
            entities={fileEntities}
            isDark={isDark}
            selectedEntityId={layoutData.selectedEntityIds.length === 1 ? layoutData.selectedEntityIds[0] : null}
            hoveredEntityId={hoveredEntityId}
            isIdle={layoutData.interaction.kind === 'idle'}
            callbacks={{
              onHoverEntity: handleHoverEntity,
              onStartDragEntity: api.startDragEntity,
              onDragEntity: api.dragEntity,
              onEndDragEntity: api.endDragEntity,
              onRenameFileEntity: api.renameFileEntity,
              onWriteFile: api.writeNoteFile,
              onJsonModeChange: (entityId, jsonMode) => {
                setFileJsonModeMap((prev) => {
                  const next = new Map(prev)
                  next.set(entityId, jsonMode)
                  return next
                })
              },
            }}
          />
        ) : null}

        {layoutData.viewMode === 'canvas' && !captureMode ? (
          <CanvasSelectionOutlineLayer
            frames={frameEntities.filter((e) => selectedEntityIdSet.has(e.id) || e.id === hoveredEntityId || marqueePreviewIds?.has(e.id))}
            allTextEntities={textEntities}
            allFileEntities={fileEntities}
            allDrawingEntities={drawingEntities}
            frameInteractionsEnabled={frameInteractionsEnabled}
            isDark={isDark}
            zoom={layoutData.zoom}
            selectedIdSet={selectedEntityIdSet}
            marqueePreviewIds={marqueePreviewIds}
            hoveredEntityId={hoveredEntityId}
            onFrameMouseDown={handleChromeMouseDown}
            onResizeFrame={(id, patch) => api.updateFrameBounds(id, patch)}
            onResizeTextEntity={(id, patch) => api.updateTextEntity(id, patch)}
            onResizeFileEntity={(id, patch) => api.updateFileEntity(id, patch)}
            onResizeDrawingEntity={(id, patch) => api.updateDrawingEntity(id, patch)}
            onResizeMulti={(entries) => api.resizeMultiSelection(entries)}
            onDrawingMouseDown={(id, event) => {
              event.stopPropagation()
              const isAdditive = event.shiftKey || event.metaKey || event.ctrlKey
              if (isAdditive) {
                api.selectEntity(id, 'drawing', {
                  shift: event.shiftKey,
                  meta: event.metaKey,
                  ctrl: event.ctrlKey,
                })
                return
              }
              api.selectEntity(id, 'drawing')
              api.startDragEntity(id)
              let lastX = event.screenX
              let lastY = event.screenY
              const onMove = (moveEvent: MouseEvent) => {
                const dx = moveEvent.screenX - lastX
                const dy = moveEvent.screenY - lastY
                lastX = moveEvent.screenX
                lastY = moveEvent.screenY
                api.dragEntity(id, dx, dy)
              }
              const onUp = () => {
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
                window.removeEventListener('blur', onUp)
                api.endDragEntity()
              }
              window.addEventListener('mousemove', onMove)
              window.addEventListener('mouseup', onUp)
              window.addEventListener('blur', onUp)
            }}
          />
        ) : null}

      </div>

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

      {layoutData.viewMode === 'canvas' ? (
        <CanvasEntityViewportLayer
          canvasOrigin={layoutData.canvasOrigin}
          pan={layoutData.pan}
          zoom={layoutData.zoom}
        >
          <TextBlockLayer
            entities={textEntities}
            getZoom={getEntityLayerZoom}
            isDark={isDark}
            marqueePreviewIds={marqueePreviewIds}
            onDrag={api.dragEntity}
            onDragEnd={api.endDragEntity}
            onDragStart={api.startDragEntity}
            onGroupDrag={api.dragGroup}
            onGroupDragEnd={api.endDragGroup}
            onGroupDragStart={api.startDragGroup}
            onResize={(id, patch) => api.updateTextEntity(id, patch)}
            onSelect={(id, modifiers) => api.selectEntity(id, 'text', modifiers)}
            onTextEditingChange={api.setTextEditing}
            onUpdateText={(id, text) => api.updateTextEntity(id, { text })}
            selectedEntityCount={layoutData.selectedEntityIds.length}
            selectedEntityIdSet={selectedEntityIdSet}
            selectedGroupDescendantIds={selectedGroupDescendantIds}
            selectedGroupId={layoutData.selectedGroupId ?? null}
          />
        </CanvasEntityViewportLayer>
      ) : null}

      {layoutData.viewMode === 'canvas' ? (
        <CanvasEntityViewportLayer
          canvasOrigin={layoutData.canvasOrigin}
          pan={layoutData.pan}
          zoom={layoutData.zoom}
        >
          <FileBlockLayer
            entities={fileEntities}
            getZoom={getEntityLayerZoom}
            isDark={isDark}
            marqueePreviewIds={marqueePreviewIds}
            onDrag={api.dragEntity}
            onDragEnd={api.endDragEntity}
            onDragStart={api.startDragEntity}
            onGroupDrag={api.dragGroup}
            onGroupDragEnd={api.endDragGroup}
            onGroupDragStart={api.startDragGroup}
            onResize={(id, patch) => api.updateFileEntity(id, patch)}
            onSelect={(id, modifiers) => api.selectEntity(id, 'file', modifiers)}
            onTextEditingChange={api.setTextEditing}
            selectedEntityCount={layoutData.selectedEntityIds.length}
            selectedEntityIdSet={selectedEntityIdSet}
            selectedGroupDescendantIds={selectedGroupDescendantIds}
            selectedGroupId={layoutData.selectedGroupId ?? null}
            jsonModeMap={fileJsonModeMap}
          />
        </CanvasEntityViewportLayer>
      ) : null}
    </div>
    </EntityHoverProvider>
  )
}
