import type { Dispatch, SetStateAction } from 'react'
import { Select } from '@base-ui/react/select'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Frame,
  MessageCircle,
  Moon,
  MousePointer2,
  PanelRight,
  PencilLine,
  Pipette,
  RotateCw,
  FileText,
  SquareDashedMousePointer,
  StickyNote,
  Sun,
} from 'lucide-react'
import type { AgentPresenceCursor, AnnotationMode, ToolbarSelectionData } from '../../shared/types'
import { summarizePresenceCursor } from '../../shared/agent-presence'
import { normalizeUserUrl } from '../../shared/url'
import { FramePresetDropdown } from '../shared/FramePresetDropdown'
import { ZOOM_PRESETS } from './useToolbarState'

function toolbarIconBtnClass(isDark: boolean): string {
  return isDark
    ? 'toolbar-squircle-btn rounded-[8px] border border-transparent bg-transparent p-1.5 text-zinc-300 hover:bg-[var(--surface-interactive-hover)] hover:text-zinc-100 active:bg-[var(--surface-interactive)] disabled:pointer-events-none disabled:opacity-45'
    : 'toolbar-squircle-btn rounded-[8px] border border-transparent bg-transparent p-1.5 text-zinc-600 hover:bg-[var(--surface-interactive-hover)] hover:text-zinc-900 active:bg-[var(--surface-interactive)] disabled:pointer-events-none disabled:opacity-45'
}

function toolbarActiveIconBtnClass(isDark: boolean): string {
  return isDark
    ? 'toolbar-squircle-btn rounded-[8px] border border-transparent bg-[var(--surface-interactive)] p-1.5 text-zinc-100'
    : 'toolbar-squircle-btn rounded-[8px] border border-transparent bg-[var(--surface-interactive)] p-1.5 text-zinc-900'
}

function AddFramePresetMenu({
  isDark,
  onAddPage,
  onDropdownOpenChange,
}: {
  isDark: boolean
  onAddPage: (presetIndex: number | 'custom') => void
  onDropdownOpenChange: (open: boolean) => void
}) {
  const triggerClassName = toolbarIconBtnClass(isDark)

  return (
    <FramePresetDropdown
      align="center"
      isDark={isDark}
      onOpenChange={onDropdownOpenChange}
      onSelectPreset={(index) => onAddPage(index)}
      onSelectCustom={() => onAddPage('custom')}
      side="bottom"
      sideOffset={4}
      trigger={
        <button
        className={`${triggerClassName} flex items-center gap-0.5 pr-1`}
        title="Add Frame"
        type="button"
      >
        <Frame size={14} />
        <ChevronDown size={10} className={isDark ? 'text-zinc-400' : 'text-zinc-500'} />
      </button>
      }
    />
  )
}

export function ToolbarDivider({ isDark }: { isDark: boolean }) {
  return (
    <div
      className={`mx-1 h-3 w-px shrink-0 ${isDark ? 'bg-zinc-600' : 'bg-zinc-300'}`}
    />
  )
}

interface LeftActionsProps {
  isDark: boolean
  leftSidebarOpen: boolean
  onToggleLeftSidebar: () => void
}

export function LeftActions({
  isDark,
  leftSidebarOpen,
  onToggleLeftSidebar,
}: LeftActionsProps) {
  const iconButtonClassName = toolbarIconBtnClass(isDark)

  return (
    <div className="flex min-w-0 items-center justify-start">
      <div className="flex w-fit items-center gap-2 [-webkit-app-region:no-drag]">
        <button
          onClick={onToggleLeftSidebar}
          className={iconButtonClassName}
          title={leftSidebarOpen ? 'Collapse left panel' : 'Expand left panel'}
          type="button"
        >
          <PanelRight
            size={14}
            className={leftSidebarOpen ? '' : 'opacity-60'}
            style={{ transform: 'scaleX(-1)' }}
          />
        </button>
      </div>
    </div>
  )
}

interface CenterActionsProps {
  isDark: boolean
  defaultToolActive: boolean
  annotationMode: AnnotationMode
  annotateAvailable: boolean
  drawingEnabled: boolean
  hasSelection: boolean
  inspectEnabled: boolean
  inspectAvailable: boolean
  zoomPercent: number
  currentPresetValue: (typeof ZOOM_PRESETS)[number] | null
  onAddPage: (presetIndex: number | 'custom') => void
  onAddTextEntity: () => void
  onAddNote: () => void
  onDropdownOpenChange: (open: boolean) => void
  onClearToolMode: () => void
  onToggleAnnotateMode: () => void
  onToggleDrawMode: () => void
  onToggleRegionSelectMode: () => void
  onToggleInspectMode: () => void
  onToggleTheme: () => void
  onZoomSet: (value: number) => void
}

export function CenterActions({
  isDark,
  defaultToolActive,
  annotationMode,
  annotateAvailable,
  drawingEnabled,
  hasSelection,
  inspectEnabled,
  inspectAvailable,
  zoomPercent,
  currentPresetValue,
  onAddPage,
  onAddTextEntity,
  onAddNote,
  onDropdownOpenChange,
  onClearToolMode,
  onToggleAnnotateMode,
  onToggleDrawMode,
  onToggleRegionSelectMode,
  onToggleInspectMode,
  onToggleTheme,
  onZoomSet,
}: CenterActionsProps) {
  const iconButtonClassName = toolbarIconBtnClass(isDark)
  const activeIconButtonClassName = toolbarActiveIconBtnClass(isDark)
  const selectTriggerClassName = isDark
    ? 'toolbar-squircle-btn flex w-[58px] cursor-pointer items-center justify-between gap-0.5 rounded-[8px] border border-transparent bg-transparent py-1 pl-2 pr-1 text-xs tabular-nums text-zinc-200 hover:bg-[var(--surface-interactive-hover)]'
    : 'toolbar-squircle-btn flex w-[58px] cursor-pointer items-center justify-between gap-0.5 rounded-[8px] border border-transparent bg-transparent py-1 pl-2 pr-1 text-xs tabular-nums text-zinc-600 hover:bg-[var(--surface-interactive-hover)] hover:text-zinc-900 active:bg-[var(--surface-interactive)]'
  const popupClassName =
    'z-50 min-w-[140px] rounded-md border border-[var(--surface-popover-border)] bg-[var(--surface-popover-subtle)] py-1 shadow-xl'
  const popupItemClassName = isDark
    ? 'flex cursor-pointer items-center justify-between gap-6 px-3 py-1.5 text-xs text-zinc-300 outline-none data-[highlighted]:bg-white/10 data-[highlighted]:text-zinc-100 data-[selected]:font-semibold data-[selected]:text-zinc-100'
    : 'flex cursor-pointer items-center justify-between gap-6 px-3 py-1.5 text-xs text-zinc-700 outline-none data-[highlighted]:bg-zinc-100 data-[highlighted]:text-zinc-900 data-[selected]:font-semibold data-[selected]:text-zinc-900'

  return (
    <div className="flex min-w-0 items-center justify-center overflow-hidden">
      <div className="flex w-fit items-center gap-1 [-webkit-app-region:no-drag]">
        <button
          onClick={onClearToolMode}
          className={`${defaultToolActive ? activeIconButtonClassName : iconButtonClassName} flex items-center gap-1`}
          title="Select"
          type="button"
        >
          <MousePointer2 size={14} />
        </button>

        {true ? (
          <div className="flex items-center">
            <AddFramePresetMenu
              isDark={isDark}
              onAddPage={onAddPage}
              onDropdownOpenChange={onDropdownOpenChange}
            />
          </div>
        ) : null}

        {true ? (
          <button
            onClick={onAddTextEntity}
            className={iconButtonClassName}
            title="Add Text Block"
            type="button"
          >
            <StickyNote size={14} />
          </button>
        ) : null}

        {true ? (
          <button
            onClick={onAddNote}
            className={iconButtonClassName}
            title="Add Note"
            type="button"
          >
            <FileText size={14} />
          </button>
        ) : null}

        <div className="ml-0.5 flex items-center gap-2">
          <button
            onClick={onToggleAnnotateMode}
            className={`${annotationMode === 'comment' ? activeIconButtonClassName : iconButtonClassName} flex items-center gap-1`}
            title="Comments"
            disabled={!annotateAvailable}
            type="button"
          >
            <MessageCircle size={14} />
          </button>

          {drawingEnabled ? (
            <button
              onClick={onToggleDrawMode}
              className={`${annotationMode === 'draw' ? activeIconButtonClassName : iconButtonClassName} flex items-center gap-1`}
              title="Draw Feedback"
              disabled={!annotateAvailable}
              type="button"
            >
              <PencilLine size={14} />
            </button>
          ) : null}

          <button
            onClick={onToggleRegionSelectMode}
            className={`${annotationMode === 'region_select' ? activeIconButtonClassName : iconButtonClassName} flex items-center gap-1`}
            title="Region Select"
            disabled={!annotateAvailable}
            type="button"
          >
            <SquareDashedMousePointer size={14} />
          </button>
        </div>

        <div className="ml-0.5 flex items-center gap-2">
          <button
            onClick={onToggleInspectMode}
            className={inspectEnabled ? activeIconButtonClassName : iconButtonClassName}
            title={hasSelection ? 'Inspect' : 'Inspect any frame'}
            disabled={!inspectAvailable}
            type="button"
          >
            <Pipette size={14} />
          </button>

          <button
            onClick={onToggleTheme}
            className={iconButtonClassName}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            type="button"
          >
            {isDark ? <Moon size={14} /> : <Sun size={14} />}
          </button>

          <Select.Root
            value={currentPresetValue}
            onValueChange={(value) => {
              if (value !== null) onZoomSet(value)
            }}
            onOpenChange={onDropdownOpenChange}
          >
            <Select.Trigger className={selectTriggerClassName} title="Zoom">
              <Select.Value placeholder={`${zoomPercent}%`}>
                {() => <span>{zoomPercent}%</span>}
              </Select.Value>
              <Select.Icon className={isDark ? 'text-zinc-400' : 'text-zinc-500'}>
                <ChevronDown size={10} />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner side="bottom" align="center" sideOffset={4}>
                <Select.Popup className={popupClassName}>
                  {ZOOM_PRESETS.map((level) => (
                    <Select.Item key={level} value={level} className={popupItemClassName}>
                      <Select.ItemText>{level}%</Select.ItemText>
                      {level === 100 ? (
                        <kbd
                          className={
                            isDark
                              ? 'rounded-[4px] bg-zinc-700 px-1.5 py-0.5 text-xs leading-none text-zinc-200'
                              : 'rounded-[4px] bg-zinc-100 px-1.5 py-0.5 text-xs leading-none text-zinc-600'
                          }
                        >
                          <span className="inline-flex items-center gap-1">
                            <span>⌘</span>
                            <span>1</span>
                          </span>
                        </kbd>
                      ) : (
                        <span />
                      )}
                    </Select.Item>
                  ))}
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
        </div>
      </div>
    </div>
  )
}

interface CenterAddressBarProps {
  isDark: boolean
  hasSelection: boolean
  selection: ToolbarSelectionData
  addressValue: string
  setAddressValue: Dispatch<SetStateAction<string>>
  addressBarRef?: React.RefObject<HTMLInputElement | null>
  align?: 'center' | 'left'
  onGoBackSelection: () => void
  onGoForwardSelection: () => void
  onReloadSelection: () => void
  onNavigateSelection: (url: string) => void
}

export function CenterAddressBar({
  isDark,
  hasSelection,
  selection,
  addressValue,
  setAddressValue,
  addressBarRef,
  align = 'center',
  onGoBackSelection,
  onGoForwardSelection,
  onReloadSelection,
  onNavigateSelection,
}: CenterAddressBarProps) {
  if (!hasSelection) {
    return <div className="flex min-w-0 justify-center px-1" />
  }

  const iconButtonClassName = toolbarIconBtnClass(isDark)
  const addressBarClassName = isDark
    ? 'flex h-7 min-w-0 items-center rounded-[8px] border border-[var(--surface-input-border)] bg-[var(--surface-input)] px-2 text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-[border-color,box-shadow] focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500'
    : 'flex h-7 min-w-0 items-center rounded-[8px] border border-[var(--surface-input-border)] bg-[var(--surface-input)] px-2 text-zinc-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-[border-color,box-shadow] focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500'
  const inputClassName = isDark
    ? 'min-w-0 flex-1 border-0 bg-transparent text-[12px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:outline-none'
    : 'min-w-0 flex-1 border-0 bg-transparent text-[12px] text-zinc-900 outline-none placeholder:text-zinc-400 focus:outline-none'

  return (
    <div className={`flex min-w-0 items-center gap-2 [-webkit-app-region:no-drag] ${align === 'left' ? 'justify-start' : 'justify-center'}`}>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onGoBackSelection}
          className={iconButtonClassName}
          disabled={!selection.canGoBack}
          title="Back"
          type="button"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={onGoForwardSelection}
          className={iconButtonClassName}
          disabled={!selection.canGoForward}
          title="Forward"
          type="button"
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={onReloadSelection}
          className={iconButtonClassName}
          title={
            selection.isLoadingAnySelected
              ? selection.selectionCount > 1
                ? `Loading ${selection.loadingFrameCount}/${selection.selectionCount} frames`
                : selection.loadingPhase === 'waiting-response'
                  ? 'Waiting for response'
                  : 'Loading'
              : 'Reload'
          }
          type="button"
        >
          <RotateCw size={14} className={selection.isLoadingAnySelected ? 'animate-spin' : ''} />
        </button>
      </div>
      <div
        className={`${addressBarClassName} min-w-[200px] ${align === 'left' ? 'w-full' : 'w-full lg:max-w-[720px]'}`}
      >
        <input
          ref={addressBarRef}
          type="text"
          value={addressValue}
          onChange={(event) => setAddressValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            const value = addressValue.trim()
            if (!value) return
            onNavigateSelection(normalizeUserUrl(value))
          }}
          placeholder={selection.placeholder}
          spellCheck={false}
          className={inputClassName}
        />
      </div>
    </div>
  )
}

interface RightPanelToggleProps {
  isDark: boolean
  devtoolsOpen: boolean
  onToggleDevTools: () => void
}

export function RightPanelToggle({
  isDark,
  devtoolsOpen,
  onToggleDevTools,
}: RightPanelToggleProps) {
  const iconButtonClassName = toolbarIconBtnClass(isDark)

  return (
    <div className="flex min-w-0 items-center justify-end">
      <div className="flex w-fit items-center gap-1 [-webkit-app-region:no-drag]">
        <button
          onClick={onToggleDevTools}
          className={iconButtonClassName}
          title={devtoolsOpen ? 'Collapse right panel' : 'Expand right panel'}
          type="button"
        >
          <PanelRight size={14} className={devtoolsOpen ? '' : 'opacity-60'} />
        </button>
      </div>
    </div>
  )
}

interface ToolbarStatusActionsProps {
  isDark: boolean
  agentCursors: AgentPresenceCursor[]
}

export function ToolbarStatusActions({
  isDark,
  agentCursors,
}: ToolbarStatusActionsProps) {
  const activeAgentCursors = agentCursors.filter((c) => c.activity !== 'idle')
  const primaryAgentCursor = activeAgentCursors[0] ?? null
  const primaryAgentSummary = primaryAgentCursor ? summarizePresenceCursor(primaryAgentCursor) : null

  return (
    <>

      {activeAgentCursors.length > 0 ? (
        <div className="flex items-center gap-1 pr-1.5">
          {activeAgentCursors.slice(0, 3).map((c) => (
            <div
              key={c.sessionId}
              className="flex items-center justify-center rounded-full"
              title={summarizePresenceCursor(c) ?? c.clientName}
              style={{
                width: 20,
                height: 20,
                backgroundColor: c.color,
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 8V4H8" />
                <rect width="16" height="12" x="4" y="8" rx="2" />
                <path d="M2 14h2" />
                <path d="M20 14h2" />
                <path d="M15 13v2">
                  <animate attributeName="d" values="M15 13v2;M15 12v3;M15 13v2" dur="1.5s" repeatCount="indefinite" />
                </path>
                <path d="M9 13v2">
                  <animate attributeName="d" values="M9 13v2;M9 12v3;M9 13v2" dur="1.5s" repeatCount="indefinite" begin="0.2s" />
                </path>
              </svg>
            </div>
          ))}
        </div>
      ) : null}
    </>
  )
}
