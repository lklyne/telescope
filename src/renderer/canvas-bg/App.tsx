import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CanvasBgElectronAPI,
  CanvasSceneFileEntity,
  CanvasScenePageEntity,
  LayoutUpdateData,
  ThemeData,
} from '../../shared/types'
import { useReportTextEditing } from '../shared/hooks/useReportTextEditing'
import { useTheme } from '../shared/hooks/useTheme'
import { DRAW_CURSOR } from './canvasBgConstants'
import { CanvasDebugBadge, CanvasGridSurface, PlacementPreviewLayer } from './CanvasGridSurface'
import { BrowserTabBar } from './BrowserTabBar'
import { DeviceShellLayer } from './DeviceShellLayer'
import { PageBorderLayer } from './PageBorderLayer'
import { SvgDeviceShellLayer } from './SvgDeviceShellLayer'
import { GroupInlineMenu } from './InlineEntityMenu'
import { useCanvasLayoutState } from './useCanvasLayoutState'
import { usePendingPlacementState } from './usePendingPlacementState'
import { useCanvasViewportGestures, type ShapePlacementDragPreview } from './useCanvasViewportGestures'

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

  const pageEntities = useMemo(
    () => layoutData.entities.filter((e): e is CanvasScenePageEntity => e.kind === 'page'),
    [layoutData.entities],
  )
  const fileEntities = useMemo(
    () => layoutData.entities.filter((e): e is CanvasSceneFileEntity => e.kind === 'file'),
    [layoutData.entities],
  )
  const borderPages = useMemo(
    () => layoutData.viewMode === 'browser'
      ? pageEntities.filter((f) => f.id === layoutData.activeBrowserTabId)
      : pageEntities,
    [pageEntities, layoutData.viewMode, layoutData.activeBrowserTabId],
  )
  const selectedGroupEntity = useMemo(() => {
    if (!layoutData.selectedGroupId) return null
    return (layoutData.groups ?? []).find((group) => group.id === layoutData.selectedGroupId) ?? null
  }, [layoutData.groups, layoutData.selectedGroupId])
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

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{
        cursor: layoutData.activeTool.kind === 'draw' ? DRAW_CURSOR : undefined,
      }}
    >
      <CanvasDebugBadge
        annotationCount={layoutData.annotations.length}
        activeTool={layoutData.activeTool}
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

      {layoutData.viewMode === 'browser' ? (
        <BrowserTabBar
          activeBrowserTabId={layoutData.activeBrowserTabId}
          leftInset={layoutData.leftChromeWidth}
          browserTabs={layoutData.browserTabs}
          isDark={isDark}
          onAddBrowserPage={api.addBrowserPage}
          onDeletePage={api.deletePage}
          onRenamePage={api.renamePage}
          onSelectBrowserTab={api.selectBrowserTab}
        />
      ) : null}

      <div className="pointer-events-none absolute inset-0">
        <PageBorderLayer
          pages={borderPages}
          fileEntities={layoutData.viewMode === 'browser' ? [] : fileEntities}
        />
        <DeviceShellLayer
          pages={borderPages.filter((f) => !f.useSvgDeviceShell)}
          fileEntities={layoutData.viewMode === 'browser' ? [] : fileEntities}
          isDark={isDark}
        />
        <SvgDeviceShellLayer
          pages={borderPages.filter((f) => f.useSvgDeviceShell)}
          isDark={isDark}
        />
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

      {/* Selected page menu now renders in the floating-ui view (above pages) */}
    </div>
  )
}
