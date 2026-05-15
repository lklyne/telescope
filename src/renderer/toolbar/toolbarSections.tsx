import type { Dispatch, SetStateAction } from 'react'
import { Select } from '@base-ui/react/select'
import { Tabs } from '@base-ui/react/tabs'
import {
  ChevronLeft,
  ChevronRight,
  LayoutTemplate,
  PanelRight,
  PanelTop,
  RotateCw,
} from 'lucide-react'
import type {
  AgentPresenceCursor,
  Tool,
  ToolbarSelectionData,
} from '../../shared/types'
import { summarizePresenceCursor } from '../../shared/agent-presence'
import { normalizeUserUrl } from '../../shared/url'
import {
  AddPageToolIcon,
  AddShapeToolIcon,
  AddStickyToolIcon,
  AddTextToolIcon,
  CommentToolIcon,
  DrawToolIcon,
  HandToolIcon,
  InspectToolIcon,
  SelectToolIcon,
  ThemeToolIcon,
  ZoomChevronIcon,
} from '../shared/CustomIcons'
import { PagePresetDropdown } from '../shared/PagePresetDropdown'
import { ZOOM_PRESETS } from './useToolbarState'

function toolbarIconBtnClass(isDark: boolean): string {
  return isDark
    ? 'toolbar-squircle-btn rounded-[8px] border border-transparent bg-transparent p-1.5 text-zinc-300 hover:bg-[var(--surface-interactive-hover)] hover:text-zinc-100 active:bg-[var(--surface-interactive)] disabled:pointer-events-none disabled:opacity-45'
    : 'toolbar-squircle-btn rounded-[8px] border border-transparent bg-transparent p-1.5 text-zinc-600 hover:bg-[var(--surface-interactive-hover)] hover:text-zinc-900 active:bg-[var(--surface-interactive)] disabled:pointer-events-none disabled:opacity-45'
}

// Tool buttons in the central toolbar match the popup IconButton tokens
// from ADR 0013 §8: 24×24, radius 6, single fill drives hover & active.
function toolbarToolBtnClass(isDark: boolean, active: boolean): string {
  const base =
    'flex h-6 w-6 items-center justify-center rounded-[6px] border-0 transition-colors disabled:pointer-events-none disabled:opacity-45'
  if (active) {
    return isDark
      ? `${base} bg-[rgba(253,248,245,0.1)] text-zinc-100`
      : `${base} bg-[#fdf8f5] text-zinc-900`
  }
  return isDark
    ? `${base} text-zinc-300 hover:bg-[rgba(253,248,245,0.1)] hover:text-zinc-100`
    : `${base} text-zinc-600 hover:bg-[#fdf8f5] hover:text-zinc-900`
}

// Toolbar icon glyphs render at 16px wide so the largest natural-aspect
// asset (29×27 add-page) sits comfortably inside the 24×24 button.
const TOOL_GLYPH_SIZE = 16

// Light-mode SVGs ship as monochrome dark glyphs; in dark mode we invert
// them rather than maintaining a parallel asset set (ADR 0013 §Icons).
function toolbarGlyphStyle(isDark: boolean): React.CSSProperties {
  return isDark ? { filter: 'invert(1) hue-rotate(180deg)' } : {}
}

function AddPagePresetMenu({
  isDark,
  active,
  onAddPage,
  onDropdownOpenChange,
}: {
  isDark: boolean
  active: boolean
  onAddPage: (presetIndex: number | 'custom') => void
  onDropdownOpenChange: (open: boolean) => void
}) {
  const triggerClassName = toolbarToolBtnClass(isDark, active)

  return (
    <PagePresetDropdown
      align="center"
      isDark={isDark}
      onOpenChange={onDropdownOpenChange}
      onSelectPreset={(index) => onAddPage(index)}
      onSelectCustom={() => onAddPage('custom')}
      side="bottom"
      sideOffset={4}
      trigger={
        <button className={triggerClassName} title="Add page" type="button">
          <AddPageToolIcon size={TOOL_GLYPH_SIZE} style={toolbarGlyphStyle(isDark)} />
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
  isBrowserMode: boolean
  activeTool: Tool
  hasPages: boolean
  drawingEnabled: boolean
  hasSelection: boolean
  zoomPercent: number
  currentPresetValue: (typeof ZOOM_PRESETS)[number] | null
  onSetTool: (tool: Tool) => void
  onDropdownOpenChange: (open: boolean) => void
  onToggleTheme: () => void
  onZoomSet: (value: number) => void
}

export function CenterActions({
  isDark,
  isBrowserMode,
  activeTool,
  hasPages,
  drawingEnabled,
  hasSelection,
  zoomPercent,
  currentPresetValue,
  onSetTool,
  onDropdownOpenChange,
  onToggleTheme,
  onZoomSet,
}: CenterActionsProps) {
  const annotateAvailable = hasPages
  const inspectAvailable = hasPages
  const onAddPage = (presetIndex: number | 'custom') =>
    onSetTool({
      kind: 'add-page',
      presetIndex: typeof presetIndex === 'number' ? presetIndex : undefined,
      customSize: presetIndex === 'custom',
    })
  const onSelectTool = () => onSetTool({ kind: 'select' })
  const onToggleHandTool = () =>
    onSetTool(activeTool.kind === 'hand' ? { kind: 'select' } : { kind: 'hand' })
  const onToggleDrawMode = () =>
    onSetTool(activeTool.kind === 'draw' ? { kind: 'select' } : { kind: 'draw' })
  const onAddSticky = () => onSetTool({ kind: 'add-sticky' })
  const onAddShape = () => onSetTool({ kind: 'add-shape' })
  const onAddText = () => onSetTool({ kind: 'add-text' })
  const onToggleCommentMode = () =>
    onSetTool(activeTool.kind === 'comment' ? { kind: 'select' } : { kind: 'comment' })
  const onToggleInspectMode = () =>
    onSetTool(activeTool.kind === 'inspect' ? { kind: 'select' } : { kind: 'inspect' })

  const buttonClass = (active: boolean) => toolbarToolBtnClass(isDark, active)
  const glyphStyle = toolbarGlyphStyle(isDark)
  const selectTriggerClassName = isDark
    ? 'toolbar-squircle-btn flex w-[58px] cursor-pointer items-center justify-between gap-0.5 rounded-[6px] border border-transparent bg-transparent py-1 pl-2 pr-1 text-xs tabular-nums text-zinc-200 hover:bg-[rgba(253,248,245,0.1)]'
    : 'toolbar-squircle-btn flex w-[58px] cursor-pointer items-center justify-between gap-0.5 rounded-[6px] border border-transparent bg-transparent py-1 pl-2 pr-1 text-xs tabular-nums text-zinc-600 hover:bg-[#fdf8f5] hover:text-zinc-900'
  const popupClassName =
    'z-50 min-w-[140px] rounded-md border border-[var(--surface-popover-border)] bg-[var(--surface-popover-subtle)] py-1 shadow-xl'
  const popupItemClassName = isDark
    ? 'flex cursor-pointer items-center justify-between gap-6 px-3 py-1.5 text-xs text-zinc-300 outline-none data-[highlighted]:bg-white/10 data-[highlighted]:text-zinc-100 data-[selected]:font-semibold data-[selected]:text-zinc-100'
    : 'flex cursor-pointer items-center justify-between gap-6 px-3 py-1.5 text-xs text-zinc-700 outline-none data-[highlighted]:bg-zinc-100 data-[highlighted]:text-zinc-900 data-[selected]:font-semibold data-[selected]:text-zinc-900'

  // ADR 0013 §5 grouping: nav | create | annotate | view.
  // Browser mode hides creation tools (no canvas placement) and the hand
  // tool (pan-on-drag is canvas-only).
  return (
    <div className="flex min-w-0 items-center justify-center overflow-hidden">
      <div className="flex w-fit items-center gap-1 [-webkit-app-region:no-drag]">
        <button
          onClick={onSelectTool}
          className={buttonClass(activeTool.kind === 'select')}
          title="Select"
          type="button"
        >
          <SelectToolIcon size={TOOL_GLYPH_SIZE} style={glyphStyle} />
        </button>

        {!isBrowserMode ? (
          <button
            onClick={onToggleHandTool}
            className={buttonClass(activeTool.kind === 'hand')}
            title="Hand"
            type="button"
          >
            <HandToolIcon size={TOOL_GLYPH_SIZE} style={glyphStyle} />
          </button>
        ) : null}

        {!isBrowserMode ? <ToolbarDivider isDark={isDark} /> : null}

        {!isBrowserMode && drawingEnabled ? (
          <button
            onClick={onToggleDrawMode}
            className={buttonClass(activeTool.kind === 'draw')}
            title="Draw"
            disabled={!annotateAvailable}
            type="button"
          >
            <DrawToolIcon size={TOOL_GLYPH_SIZE} style={glyphStyle} />
          </button>
        ) : null}

        {!isBrowserMode ? (
          <button
            onClick={onAddSticky}
            className={buttonClass(activeTool.kind === 'add-sticky')}
            title="Add sticky"
            type="button"
          >
            <AddStickyToolIcon size={TOOL_GLYPH_SIZE} style={glyphStyle} />
          </button>
        ) : null}

        {!isBrowserMode ? (
          <button
            onClick={onAddShape}
            className={buttonClass(activeTool.kind === 'add-shape')}
            title="Add shape"
            type="button"
          >
            <AddShapeToolIcon size={TOOL_GLYPH_SIZE} style={glyphStyle} />
          </button>
        ) : null}

        {!isBrowserMode ? (
          <AddPagePresetMenu
            isDark={isDark}
            active={activeTool.kind === 'add-page'}
            onAddPage={onAddPage}
            onDropdownOpenChange={onDropdownOpenChange}
          />
        ) : null}

        {!isBrowserMode ? <ToolbarDivider isDark={isDark} /> : null}

        {!isBrowserMode ? (
          <button
            onClick={onAddText}
            className={buttonClass(activeTool.kind === 'add-text')}
            title="Add text"
            type="button"
          >
            <AddTextToolIcon size={TOOL_GLYPH_SIZE} style={glyphStyle} />
          </button>
        ) : null}

        <button
          onClick={onToggleCommentMode}
          className={buttonClass(activeTool.kind === 'comment')}
          title="Comment"
          disabled={!annotateAvailable}
          type="button"
        >
          <CommentToolIcon size={TOOL_GLYPH_SIZE} style={glyphStyle} />
        </button>

        <button
          onClick={onToggleInspectMode}
          className={buttonClass(activeTool.kind === 'inspect')}
          title={hasSelection ? 'Inspect' : 'Inspect any page'}
          disabled={!inspectAvailable}
          type="button"
        >
          <InspectToolIcon size={TOOL_GLYPH_SIZE} style={glyphStyle} />
        </button>

        <ToolbarDivider isDark={isDark} />

        <button
          onClick={onToggleTheme}
          className={buttonClass(false)}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          type="button"
        >
          <ThemeToolIcon size={TOOL_GLYPH_SIZE} style={glyphStyle} />
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
              <ZoomChevronIcon size={10} style={glyphStyle} />
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
                ? `Loading ${selection.loadingPageCount}/${selection.selectionCount} pages`
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
  isBrowserMode: boolean
  hasPages: boolean
  onToggleDevTools: () => void
  onToggleBrowserMode: () => void
}

export function RightPanelToggle({
  isDark,
  devtoolsOpen,
  isBrowserMode,
  hasPages,
  onToggleDevTools,
  onToggleBrowserMode,
}: RightPanelToggleProps) {
  const iconButtonClassName = toolbarIconBtnClass(isDark)

  const modeTabClassName = isDark
    ? 'toolbar-squircle-btn relative z-10 flex items-center justify-center rounded-[8px] border-0 bg-transparent p-1.5 text-zinc-300 opacity-60 outline-none transition-[color,opacity] select-none hover:text-zinc-100 hover:opacity-100 data-[active]:text-zinc-100 data-[active]:opacity-100 disabled:pointer-events-none disabled:opacity-45'
    : 'toolbar-squircle-btn relative z-10 flex items-center justify-center rounded-[8px] border-0 bg-transparent p-1.5 text-zinc-600 opacity-60 outline-none transition-[color,opacity] select-none hover:text-zinc-900 hover:opacity-100 data-[active]:text-zinc-900 data-[active]:opacity-100 disabled:pointer-events-none disabled:opacity-45'
  const modeTabIndicatorClassName =
    'absolute top-1/2 left-0 z-[-1] h-[var(--active-tab-height)] w-[var(--active-tab-width)] -translate-y-1/2 translate-x-[var(--active-tab-left)] rounded-[8px] bg-[var(--surface-interactive)] transition-all duration-200 ease-in-out'

  return (
    <div className="flex min-w-0 items-center justify-end">
      <div className="flex w-fit items-center gap-1 [-webkit-app-region:no-drag]">
        <Tabs.Root
          value={isBrowserMode ? 'browser' : 'canvas'}
          onValueChange={(value) => {
            if ((value === 'browser') !== isBrowserMode) {
              onToggleBrowserMode()
            }
          }}
        >
          <Tabs.List className="relative z-0 flex items-center gap-1" aria-label="View mode">
            <Tabs.Tab className={modeTabClassName} value="canvas" title="Canvas">
              <LayoutTemplate size={14} />
            </Tabs.Tab>
            <Tabs.Tab className={modeTabClassName} disabled={!hasPages} value="browser" title="Browser">
              <PanelTop size={14} />
            </Tabs.Tab>
            <Tabs.Indicator className={modeTabIndicatorClassName} />
          </Tabs.List>
        </Tabs.Root>

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
