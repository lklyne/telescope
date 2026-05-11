import { useMemo, useRef } from 'react'
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
import { CanvasDebugBadge, CanvasGridSurface } from './CanvasGridSurface'
import { BrowserTabBar } from './BrowserTabBar'
import { DeviceShellLayer } from './DeviceShellLayer'
import { PageBorderLayer } from './PageBorderLayer'
import { SvgDeviceShellLayer } from './SvgDeviceShellLayer'
import { useCanvasLayoutState } from './useCanvasLayoutState'
import { useCanvasViewportGestures } from './useCanvasViewportGestures'

const api = (window as unknown as { electronAPI: CanvasBgElectronAPI }).electronAPI

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

  useCanvasViewportGestures({
    api,
    bgRef,
    layoutRef,
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

      {/* Group selection popup migrated to above-view (ADR 0006 §1, step 5).
          Selected page menu lives in the floating-ui view. */}
    </div>
  )
}
