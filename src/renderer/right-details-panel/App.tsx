import type { ThemeData } from '../../shared/types'
import { DRAWING_FEATURE_ENABLED } from '../../shared/featureFlags'
import { useAnnotateToggleShortcut } from '../shared/hooks/useAnnotateToggleShortcut'
import { useReportTextEditing } from '../shared/hooks/useReportTextEditing'
import { useTheme } from '../shared/hooks/useTheme'
import { DocumentPane } from './components/DocumentPane'
import { DrawingEntityPane } from './components/DrawingEntityPane'
import { EdgeEntityPane } from './components/EdgeEntityPane'
import { FileEntityPane } from './components/FileEntityPane'
import { FramePane } from './components/FramePane'
import { GroupEntityPane } from './components/GroupEntityPane'
import { MultiEntityPane } from './components/MultiEntityPane'
import { PaneHeader } from './components/PaneHeader'
import { TextEntityPane } from './components/TextEntityPane'
import { rightDetailsPanelApi } from './rightDetailsPanelApi'
import { isMcpConnected } from './rightDetailsPanelSelectors'
import { useInstallCommandCopy } from './useInstallCommandCopy'
import { useRightDetailsPanelData } from './useRightDetailsPanelData'

export default function App({ initialTheme }: { initialTheme: ThemeData }) {
  const panelData = useRightDetailsPanelData()
  const isDark = useTheme(initialTheme, rightDetailsPanelApi.onThemeChanged)
  const { copiedInstall, copyInstallCommand } = useInstallCommandCopy()

  useAnnotateToggleShortcut({
    clearToolMode: rightDetailsPanelApi.clearToolMode,
    toggleAnnotateMode: rightDetailsPanelApi.toggleAnnotateMode,
    toggleDrawMode: DRAWING_FEATURE_ENABLED ? rightDetailsPanelApi.toggleDrawMode : undefined,
  })
  useReportTextEditing(rightDetailsPanelApi.setTextEditing)

  const frameClass = isDark
    ? 'h-screen w-screen overflow-hidden border-l border-[var(--surface-panel-border)] bg-[var(--surface-panel)] text-zinc-100'
    : 'h-screen w-screen overflow-hidden border-l border-[var(--surface-panel-border)] bg-[var(--surface-panel)] text-zinc-900'
  const frames = panelData.frames ?? []
  const annotations = panelData.annotations ?? []
  const mcpSetup = panelData.emptyState?.kind === 'mcp_setup' ? panelData.emptyState : null
  const mcpConnected = isMcpConnected(mcpSetup)
  const { panelMode } = panelData

  if (panelData.activeTab === 'browser-devtools') {
    return (
      <div className={frameClass}>
        <PaneHeader
          icon={
            <svg className="h-3.5 w-3.5 shrink-0 opacity-50" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.708 5.578L2.061 8.224l2.647 2.646-.708.708L.646 8.224 4 4.87l.708.708zm7.292 0l2.647 2.646-2.647 2.646.708.708L16.062 8.224 12.708 4.87l-.708.708zM6.754 12.5l1.429-9h1.063l-1.429 9H6.754z" />
            </svg>
          }
          label="Dev Tools"
          actions={
            <button
              type="button"
              className={`rounded p-0.5 ${
                isDark ? 'hover:bg-zinc-700' : 'hover:bg-zinc-200'
              }`}
              onClick={() => rightDetailsPanelApi.closeBrowserDevTools()}
            >
              <svg className="h-3.5 w-3.5 opacity-50" viewBox="0 0 16 16" fill="currentColor">
                <path d="M12.354 4.354a.5.5 0 0 0-.708-.708L8 7.293 4.354 3.646a.5.5 0 1 0-.708.708L7.293 8l-3.647 3.646a.5.5 0 0 0 .708.708L8 8.707l3.646 3.647a.5.5 0 0 0 .708-.708L8.707 8l3.647-3.646z" />
              </svg>
            </button>
          }
        />
      </div>
    )
  }

  function renderPane() {
    switch (panelMode.kind) {
      case 'frame':
        return panelData.inspect ? (
          <FramePane
            inspect={panelData.inspect}
            isDark={isDark}
            annotations={annotations}
            selection={panelData.selection}
            frames={frames}
          />
        ) : null

      case 'text':
        return panelData.textEntity ? (
          <TextEntityPane textEntity={panelData.textEntity} isDark={isDark} />
        ) : null

      case 'file':
        return panelData.fileEntity ? (
          <FileEntityPane fileEntity={panelData.fileEntity} isDark={isDark} />
        ) : null

      case 'drawing':
        return DRAWING_FEATURE_ENABLED && panelData.drawingEntity ? (
          <DrawingEntityPane drawingEntity={panelData.drawingEntity} isDark={isDark} />
        ) : null

      case 'edge':
        return panelData.edgeEntity ? (
          <EdgeEntityPane edgeEntity={panelData.edgeEntity} isDark={isDark} />
        ) : null

      case 'group':
        return panelData.groupEntity ? (
          <GroupEntityPane groupEntity={panelData.groupEntity} isDark={isDark} />
        ) : null

      case 'multi':
        return panelData.multiEntities ? (
          <MultiEntityPane multiEntities={panelData.multiEntities} isDark={isDark} />
        ) : null

      case 'document':
      default:
        return (
          <DocumentPane
            isDark={isDark}
            annotations={annotations}
            frames={frames}
            focusedAnnotationId={panelData.focusedAnnotationId}
            annotateEnabled={Boolean(panelData.annotateEnabled)}
            annotateAvailable={Boolean(panelData.annotateAvailable)}
            originBindings={panelData.originBindings ?? {}}
            fixInProgress={panelData.fixInProgress ?? {}}
            mcpSetup={mcpSetup}
            mcpConnected={mcpConnected}
            copiedInstall={copiedInstall}
            copyInstallCommand={copyInstallCommand}
          />
        )
    }
  }

  return (
    <div className={frameClass}>
      <div className="flex h-full min-h-0 flex-col">
        {renderPane()}
      </div>
    </div>
  )
}
