import { useEffect } from 'react'
import { DRAWING_FEATURE_ENABLED } from '../../shared/featureFlags'
import type { ThemeData } from '../../shared/types'
import { isPlainShortcutKey } from '../../shared/gesture-utils'
import { useAnnotateToggleShortcut } from '../shared/hooks/useAnnotateToggleShortcut'
import { useReportTextEditing } from '../shared/hooks/useReportTextEditing'
import { useTheme } from '../shared/hooks/useTheme'
import { toolbarApi } from './toolbarApi'
import {
  CenterAddressBar,
  CenterActions,
  LeftActions,
  RightPanelToggle,
  ToolbarDivider,
  ToolbarStatusActions,
} from './toolbarSections'
import { useToolbarState } from './useToolbarState'

export default function App({ initialTheme }: { initialTheme: ThemeData }) {
  const {
    zoomPercent,
    leftSidebarOpen,
    devtoolsOpen,
    inspectEnabled,
    inspectAvailable,
    annotationMode,
    annotateAvailable,
    selection,
    addressValue,
    setAddressValue,
    addressBarRef,
    currentPresetValue,
    hasSelection,
    hasFrames,
    isBrowserMode,
    defaultToolActive,
    agentCursors,
  } = useToolbarState()

  const isDark = useTheme(initialTheme, toolbarApi.onThemeChanged)

  useAnnotateToggleShortcut({
    clearToolMode: toolbarApi.clearToolMode,
    toggleAnnotateMode: toolbarApi.toggleAnnotateMode,
    toggleDrawMode: DRAWING_FEATURE_ENABLED ? toolbarApi.toggleDrawMode : undefined,
  })
  useReportTextEditing(toolbarApi.setTextEditing)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!document.hasFocus()) return
      if (
        isPlainShortcutKey(event, 'escape') &&
        (selection.pendingPlacementActive ||
          annotationMode !== 'off' ||
          inspectEnabled ||
          selection.viewMode === 'browser')
      ) {
        event.preventDefault()
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        toolbarApi.cancelPendingPlacement()
        if (annotationMode !== 'off' || inspectEnabled) {
          toolbarApi.clearToolMode()
        }
        if (selection.viewMode === 'browser') {
          toolbarApi.toggleBrowserMode()
        }
        return
      }

      if (event.key.toLowerCase() !== 'r' || !event.shiftKey) return
      if (!event.metaKey && !event.ctrlKey) return
      event.preventDefault()
      toolbarApi.reloadApp()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [annotationMode, inspectEnabled, selection.viewMode])
  const isMac = navigator.userAgent.includes('Mac')
  const showMultiFrameAddressBar = selection.selectionCount > 1
  const showTabsModeAddressBar = isBrowserMode && hasSelection
  const showCenterActionsOnly = !showMultiFrameAddressBar && !showTabsModeAddressBar

  return (
    <>
      <style>{`
        html, body, #root {
          background: transparent !important;
          margin: 0;
          padding: 0;
          overflow: visible !important;
        }
        html:not(.dark) .toolbar-bar {
          background: var(--surface-toolbar);
          color: var(--surface-toolbar-foreground);
          border-bottom-color: var(--surface-toolbar-border);
        }
        html.dark .toolbar-bar {
          background: var(--surface-toolbar);
          color: var(--surface-toolbar-foreground);
          border-bottom-color: var(--surface-toolbar-border);
        }
        html:not(.dark) [data-popup-open] {
          background: var(--surface-popover);
          border-color: var(--surface-popover-border);
          color: var(--surface-toolbar-foreground);
        }
        html.dark [data-popup-open] {
          background: color-mix(in srgb, var(--surface-popover) 70%, transparent);
          border-color: transparent;
          color: #f4f4f5;
        }
        .nav-squircle-btn {
          border-radius: 16px;
          -electron-corner-smoothing: system-ui;
        }
        .toolbar-squircle-btn {
          border-radius: 8px;
          -electron-corner-smoothing: system-ui;
        }
      `}</style>

      <div
        className={`toolbar-bar fixed top-0 left-0 right-0 grid h-[44px] grid-cols-[auto_1fr_auto] items-center gap-1 ${
          isMac ? 'pl-[86px] pr-4' : 'px-4'
        } select-none [-webkit-app-region:drag] border-b border-[var(--surface-toolbar-border)] bg-[var(--surface-toolbar)] text-[var(--surface-toolbar-foreground)]`}
      >
        <LeftActions
          isDark={isDark}
          leftSidebarOpen={leftSidebarOpen}
          onToggleLeftSidebar={toolbarApi.toggleLeftSidebar}
          onDropdownOpenChange={(open) => {
            if (open) toolbarApi.dropdownOpen()
            else toolbarApi.dropdownClose()
          }}
        />

        {showTabsModeAddressBar ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <ToolbarDivider isDark={isDark} />
            <div className="min-w-0 flex-1">
              <CenterAddressBar
                isDark={isDark}
                hasSelection={hasSelection}
                selection={selection}
                addressValue={addressValue}
                setAddressValue={setAddressValue}
                addressBarRef={addressBarRef}
                align="left"
                onGoBackSelection={toolbarApi.goBackSelection}
                onGoForwardSelection={toolbarApi.goForwardSelection}
                onReloadSelection={toolbarApi.reloadSelection}
                onNavigateSelection={toolbarApi.navigateSelection}
              />
            </div>
            <ToolbarDivider isDark={isDark} />
            <div className="flex shrink-0 items-center gap-2 [-webkit-app-region:no-drag]">
              <CenterActions
                isDark={isDark}
                isBrowserMode={isBrowserMode}
                defaultToolActive={defaultToolActive}
                annotationMode={annotationMode}
                annotateAvailable={annotateAvailable}
                drawingEnabled={DRAWING_FEATURE_ENABLED}
                hasSelection={hasSelection}
                inspectEnabled={inspectEnabled}
                inspectAvailable={inspectAvailable}
                zoomPercent={zoomPercent}
                currentPresetValue={currentPresetValue}
                onAddPage={toolbarApi.addPage}
                onAddTextEntity={toolbarApi.addTextEntity}
                onAddNote={toolbarApi.addNote}
                onDropdownOpenChange={(open) => {
                  if (open) toolbarApi.dropdownOpen()
                  else toolbarApi.dropdownClose()
                }}
                onClearToolMode={toolbarApi.clearToolMode}
                onToggleAnnotateMode={toolbarApi.toggleAnnotateMode}
                onToggleDrawMode={toolbarApi.toggleDrawMode}
                onToggleRegionSelectMode={toolbarApi.toggleRegionSelectMode}
                onToggleInspectMode={toolbarApi.toggleInspectMode}
                onToggleTheme={toolbarApi.toggleTheme}
                onZoomSet={(value) => toolbarApi.zoomSet(value / 100)}
              />
            </div>
          </div>
        ) : showMultiFrameAddressBar ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <ToolbarDivider isDark={isDark} />
            <div className="min-w-0 flex-1">
              <CenterAddressBar
                isDark={isDark}
                hasSelection={hasSelection}
                selection={selection}
                addressValue={addressValue}
                setAddressValue={setAddressValue}
                onGoBackSelection={toolbarApi.goBackSelection}
                onGoForwardSelection={toolbarApi.goForwardSelection}
                onReloadSelection={toolbarApi.reloadSelection}
                onNavigateSelection={toolbarApi.navigateSelection}
              />
            </div>
          </div>
        ) : showCenterActionsOnly ? (
          <div className="flex items-center justify-center">
            <div className="flex min-w-0 max-w-full items-center gap-2 [-webkit-app-region:no-drag]">
              <CenterActions
                isDark={isDark}
                isBrowserMode={isBrowserMode}
                defaultToolActive={defaultToolActive}
                annotationMode={annotationMode}
                annotateAvailable={annotateAvailable}
                drawingEnabled={DRAWING_FEATURE_ENABLED}
                hasSelection={hasSelection}
                inspectEnabled={inspectEnabled}
                inspectAvailable={inspectAvailable}
                zoomPercent={zoomPercent}
                currentPresetValue={currentPresetValue}
                onAddPage={toolbarApi.addPage}
                onAddTextEntity={toolbarApi.addTextEntity}
                onAddNote={toolbarApi.addNote}
                onDropdownOpenChange={(open) => {
                  if (open) toolbarApi.dropdownOpen()
                  else toolbarApi.dropdownClose()
                }}
                onClearToolMode={toolbarApi.clearToolMode}
                onToggleAnnotateMode={toolbarApi.toggleAnnotateMode}
                onToggleDrawMode={toolbarApi.toggleDrawMode}
                onToggleRegionSelectMode={toolbarApi.toggleRegionSelectMode}
                onToggleInspectMode={toolbarApi.toggleInspectMode}
                onToggleTheme={toolbarApi.toggleTheme}
                onZoomSet={(value) => toolbarApi.zoomSet(value / 100)}
              />
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 items-center justify-end gap-1">
          <ToolbarStatusActions
            isDark={isDark}
            agentCursors={agentCursors}
          />
          {!showCenterActionsOnly && <ToolbarDivider isDark={isDark} />}
          <RightPanelToggle
            isDark={isDark}
            devtoolsOpen={devtoolsOpen}
            isBrowserMode={isBrowserMode}
            hasFrames={hasFrames}
            onToggleDevTools={toolbarApi.toggleDevTools}
            onToggleBrowserMode={toolbarApi.toggleBrowserMode}
          />
        </div>
      </div>
    </>
  )
}
