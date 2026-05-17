import { Collapsible } from '@base-ui/react/collapsible'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Laptop,
  Link2,
  Monitor,
  RotateCw,
  Smartphone,
  Tablet,
  Trash2,
  Wrench,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
  Annotation,
  DevtoolsPanelPageSummary,
  DevtoolsPanelSelectionSummary,
  FixProgressEntry,
  InspectPanelState,
} from '../../../shared/types'
import { DEVICE_CATALOG } from '../../../shared/device-catalog'
import { VIEWPORT_PRESETS } from '../../../shared/constants'
import { normalizeUserUrl } from '../../../shared/url'
import { PagePresetDropdown } from '../../shared/PagePresetDropdown'
import {
  dividerClass,
  isUnresolved,
  mutedClass,
} from '../rightDetailsPanelHelpers'
import { rightDetailsPanelApi } from '../rightDetailsPanelApi'
import {
  buildUnresolvedCountsByNodeId,
  getInspectDetailState,
  resolvePageDimensions,
} from '../rightDetailsPanelSelectors'
import { useClearInspectHoverOnLeave } from '../useClearInspectHoverOnLeave'
import { useElementCommentDraft } from '../useElementCommentDraft'
import { useInspectTreeState } from '../useInspectTreeState'
import { CommentRow } from './CommentsPane'
import { ElementCommentComposer } from './ElementCommentComposer'
import { InspectDetailSection } from './InspectDetailSection'
import { InspectTree } from './InspectTree'
import { PaneHeader } from './PaneHeader'
import { InfoIcon } from '../../shared/PanelIcons'

export function PagePane({
  inspect,
  isDark,
  annotations,
  selection,
  pages,
  fixProgress,
}: {
  inspect: InspectPanelState
  isDark: boolean
  annotations: Annotation[]
  selection?: DevtoolsPanelSelectionSummary
  pages: DevtoolsPanelPageSummary[]
  fixProgress: Record<string, FixProgressEntry>
}) {
  const muted = mutedClass(isDark)
  const divider = dividerClass(isDark)
  const elementsSectionRef = useRef<HTMLElement>(null)
  const activePage = inspect.activePageId
    ? pages.find((page) => page.id === inspect.activePageId)
    : undefined
  const activePageDimensions = activePage ? resolvePageDimensions(activePage) : {}
  const { activeDetail, hoveredDetail, selectedDetail } = getInspectDetailState(inspect)
  const unresolvedCountsByNodeId = buildUnresolvedCountsByNodeId(
    annotations,
    inspect.activePageId,
  )
  const { expanded, registerNodeElement, setExpanded } = useInspectTreeState(inspect)
  const {
    commentInputRef,
    elementCommentText,
    hasElementComment,
    setElementCommentText,
    submitElementComment,
  } = useElementCommentDraft({
    activeDetail,
    selection,
  })

  const clearInspectListState = (clearHover: boolean) => {
    rightDetailsPanelApi.clearInspectSelection()
    if (clearHover && inspect.activePageId) {
      rightDetailsPanelApi.setInspectHoverNode(inspect.activePageId, null)
    }
  }

  useClearInspectHoverOnLeave(inspect.activePageId ?? null, inspect.selectedNodeId ?? null)

  const collapsiblePanelClass =
    'h-[var(--collapsible-panel-height)] overflow-hidden transition-all ease-out data-[ending-style]:h-0 data-[starting-style]:h-0 duration-150 [&[hidden]:not([hidden=\'until-found\'])]:hidden'

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onPointerDownCapture={(event) => {
        if (inspect.enabled) return
        if (!inspect.selectedNodeId && !inspect.hoveredNodeId) return
        const elementsSection = elementsSectionRef.current
        if (!elementsSection) return
        const target = event.target
        if (!(target instanceof Node)) return
        if (elementsSection.contains(target)) return
        clearInspectListState(true)
      }}
    >
      <div className="thin-scrollbar min-h-0 flex-1 overflow-auto [&>section:first-of-type]:border-t-0">
        {/* Page header */}
        {inspect.activePageId ? (
          <PaneHeader
            icon={<PageFavicon faviconUrl={activePage?.faviconUrl} label={activePage?.label} width={activePageDimensions.width} />}
            label={activePage?.label ?? 'Page'}
            actions={
              <PageHeaderActions
                pageId={inspect.activePageId!}
                linked={activePage?.linked ?? false}
                isDark={isDark}
              />
            }
          />
        ) : (
          <PaneHeader
            icon={<Laptop size={14} className="shrink-0 text-zinc-500" />}
            label="Waiting for page data…"
          />
        )}

        {/* Navigation & page actions */}
        {activePage ? (
          <PageNavigationSection
            page={activePage}
            isDark={isDark}
            divider={divider}
          />
        ) : null}

        {/* Dimensions & device page */}
        {activePage ? (
          <DeviceFrameSection
            page={activePage}
            isDark={isDark}
            divider={divider}
          />
        ) : null}

        {/* Page comments (collapsible, only when there are unresolved comments) */}
        <PageCommentsSection
          annotations={annotations}
          activePageId={inspect.activePageId}
          isDark={isDark}
          divider={divider}
          muted={muted}
          collapsiblePanelClass={collapsiblePanelClass}
          fixProgress={fixProgress}
        />

        {/* Inspect tree (collapsible) */}
        <section ref={elementsSectionRef} className={`border-t ${divider}`}>
          <Collapsible.Root defaultOpen>
            <div className="flex items-center">
              <Collapsible.Trigger
                className={`group flex flex-1 items-center gap-1.5 px-2 py-2 text-[12px] font-medium`}
              >
                <ChevronDown size={12} className="hidden group-data-[panel-open]:block" />
                <ChevronRight size={12} className="block group-data-[panel-open]:hidden" />
                Inspect Tree
              </Collapsible.Trigger>
              <div className="group relative pr-3">
                <button
                  type="button"
                  className={`rounded p-1 opacity-30 hover:opacity-100 ${muted} hover:text-zinc-600 dark:hover:text-zinc-300`}
                  aria-label="Show inspect diagnostics"
                  title="Show inspect diagnostics"
                >
                  <InfoIcon className="size-3.5" />
                </button>
                <div
                  className={`pointer-events-none invisible absolute top-5 right-0 z-20 w-64 rounded border px-2 py-1.5 text-[10px] leading-4 opacity-0 shadow-sm transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${
                    isDark
                      ? 'border-zinc-700 bg-zinc-900 text-zinc-300'
                      : 'border-zinc-300 bg-zinc-50 text-zinc-700'
                  }`}
                >
                  <div>Mode: {inspect.mode === 'page_locked' ? 'Page locked' : 'Global target'}</div>
                  {inspect.diagnostics ? (
                    <>
                      <div>Collector: {inspect.diagnostics.collector}</div>
                      <div>Nodes: {inspect.diagnostics.nodeCount}</div>
                      <div>React: {inspect.diagnostics.reactNodeCount}</div>
                      <div>DOM: {inspect.diagnostics.domFallbackNodeCount}</div>
                      <div>Source refs: {inspect.diagnostics.sourceLocationCount}</div>
                    </>
                  ) : (
                    <div>No diagnostics available.</div>
                  )}
                </div>
              </div>
            </div>
            <Collapsible.Panel className={collapsiblePanelClass}>
              <div
                className="thin-scrollbar pb-2"
                onPointerLeave={() => {
                  if (inspect.activePageId) {
                    rightDetailsPanelApi.setInspectHoverNode(
                      inspect.activePageId,
                      inspect.selectedNodeId,
                    )
                  }
                }}
              >
                {inspect.treeRootIds.length ? (
                  <InspectTree
                    treeRootIds={inspect.treeRootIds}
                    activePageId={inspect.activePageId!}
                    nodesById={inspect.nodesById}
                    unresolvedCountsByNodeId={unresolvedCountsByNodeId}
                    expanded={expanded}
                    setExpanded={setExpanded}
                    hoveredNodeId={inspect.hoveredNodeId}
                    selectedNodeId={inspect.selectedNodeId}
                    registerNodeElement={registerNodeElement}
                  />
                ) : (
                  <div className={`px-4 py-3 text-xs ${muted}`}>
                    No inspect hierarchy available yet.
                  </div>
                )}
              </div>
            </Collapsible.Panel>
          </Collapsible.Root>
        </section>

        {/* Element detail (collapsible) */}
        <section className={`border-t ${divider}`}>
          <Collapsible.Root defaultOpen>
            <Collapsible.Trigger
              className={`group flex w-full items-center gap-1.5 px-2 py-2 text-[12px] font-medium`}
            >
              <ChevronDown size={12} className="hidden group-data-[panel-open]:block" />
              <ChevronRight size={12} className="block group-data-[panel-open]:hidden" />
              Element Detail
            </Collapsible.Trigger>
            <Collapsible.Panel className={collapsiblePanelClass}>
              <div className="px-2 pb-3">
                <InspectDetailSection
                  activeDetail={activeDetail}
                  hoveredDetail={hoveredDetail}
                  isDark={isDark}
                  mutedClass={muted}
                  selectedDetail={selectedDetail}
                />
              </div>
            </Collapsible.Panel>
          </Collapsible.Root>
        </section>
      </div>

      {/* Comment composer (pinned at bottom) */}
      <section className={`shrink-0 border-t px-2 py-2 ${divider}`}>
        <ElementCommentComposer
          active={Boolean(activeDetail)}
          commentInputRef={commentInputRef}
          elementCommentText={elementCommentText}
          hasElementComment={hasElementComment}
          onChange={setElementCommentText}
          onSubmit={submitElementComment}
        />
      </section>
    </div>
  )
}

// --- Page Comments (unresolved comments anchored to the active page) ---

function unresolvedCommentsForPage(
  annotations: Annotation[],
  activePageId: string | null,
): Annotation[] {
  if (!activePageId) return []
  return annotations.filter((a) => {
    if (!isUnresolved(a.status)) return false
    if (a.anchor.type === 'canvas') return false
    if (a.anchor.type === 'region') {
      return a.metadata?.regionComponents?.some(
        (rc) => rc.pageId === activePageId,
      ) ?? false
    }
    return a.anchor.pageId === activePageId
  })
}

function PageCommentsSection({
  annotations,
  activePageId,
  isDark,
  divider,
  muted,
  collapsiblePanelClass,
  fixProgress,
}: {
  annotations: Annotation[]
  activePageId: string | null
  isDark: boolean
  divider: string
  muted: string
  collapsiblePanelClass: string
  fixProgress: Record<string, FixProgressEntry>
}) {
  const pageComments = unresolvedCommentsForPage(annotations, activePageId)
  if (!pageComments.length) return null
  return (
    <section className={`border-t ${divider}`}>
      <Collapsible.Root defaultOpen>
        <Collapsible.Trigger
          className={`group flex w-full items-center gap-1.5 px-2 py-2 text-[12px] font-medium`}
        >
          <ChevronDown size={12} className="hidden group-data-[panel-open]:block" />
          <ChevronRight size={12} className="block group-data-[panel-open]:hidden" />
          Comments
          <span className={`text-[10px] font-normal ${muted}`}>
            ({pageComments.length})
          </span>
        </Collapsible.Trigger>
        <Collapsible.Panel className={collapsiblePanelClass}>
          <div className="space-y-2 px-2 pb-2">
            {pageComments.map((annotation) => (
              <CommentRow
                key={annotation.id}
                annotation={annotation}
                isDark={isDark}
                mutedClass={muted}
                rowHoverClass={isDark ? 'hover:bg-zinc-700/55' : 'hover:bg-zinc-50'}
                focusRowClass=""
                registerAnnotationElement={() => {}}
                progress={fixProgress[annotation.id]}
              />
            ))}
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>
    </section>
  )
}

// --- Page Header Actions (inline with PaneHeader) ---

function PageHeaderActions({
  pageId,
  linked,
  isDark,
}: {
  pageId: string
  linked: boolean
  isDark: boolean
}) {
  const btnClass = `rounded p-1 ${
    isDark ? 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200' : 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700'
  }`
  const deleteBtnClass = `rounded p-1 ${
    isDark ? 'text-zinc-400 hover:bg-red-500/12 hover:text-red-400' : 'text-zinc-500 hover:bg-red-50 hover:text-red-600'
  }`

  return (
    <div className="flex items-center gap-0.5">
      <button type="button" className={btnClass} aria-label="Duplicate" title="Duplicate" onClick={() => rightDetailsPanelApi.duplicatePage(pageId)}>
        <Copy size={13} />
      </button>
      <button
        type="button"
        className={btnClass}
        aria-label={linked ? 'Unlink Page' : 'Link Page'}
        title={linked ? 'Unlink Page' : 'Link Page'}
        onClick={() => rightDetailsPanelApi.toggleLinkedPage(pageId)}
        style={linked ? { color: isDark ? '#60a5fa' : '#2563eb' } : undefined}
      >
        <Link2 size={13} />
      </button>
      <button type="button" className={btnClass} aria-label="Open DevTools" title="Open DevTools" onClick={() => rightDetailsPanelApi.openBrowserDevTools()}>
        <Wrench size={13} />
      </button>
      <button type="button" className={deleteBtnClass} aria-label="Delete Page" title="Delete Page" onClick={() => rightDetailsPanelApi.deletePage(pageId)}>
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// --- Page Navigation & Actions ---

function PageNavigationSection({
  page,
  isDark,
  divider,
}: {
  page: DevtoolsPanelPageSummary
  isDark: boolean
  divider: string
}) {
  const [urlValue, setUrlValue] = useState(page.url)
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setUrlValue(page.url)
  }, [page.url])

  useEffect(() => {
    if (isEditingUrl) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditingUrl])

  const handleCommitUrl = () => {
    const value = urlValue.trim()
    if (value && value !== page.url) {
      rightDetailsPanelApi.navigatePage(page.id, normalizeUserUrl(value))
    }
    setIsEditingUrl(false)
  }

  const navBtnClass = isDark
    ? 'rounded-md p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-40'
    : 'rounded-md p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 disabled:pointer-events-none disabled:opacity-40'

  const inputContainerClass = isDark
    ? 'flex h-7 items-center rounded-md border border-[var(--surface-input-border)] bg-[var(--surface-input)] px-2 text-zinc-200 transition-[border-color,box-shadow] focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500'
    : 'flex h-7 items-center rounded-md border border-[var(--surface-input-border)] bg-[var(--surface-input)] px-2 text-zinc-800 transition-[border-color,box-shadow] focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500'

  return (
    <section className={`border-t ${divider}`}>
      {/* Navigation bar */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          className={navBtnClass}
          disabled={!page.canGoBack}
          title="Back"
          onClick={() => rightDetailsPanelApi.goBackPage(page.id)}
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          className={navBtnClass}
          disabled={!page.canGoForward}
          title="Forward"
          onClick={() => rightDetailsPanelApi.goForwardPage(page.id)}
        >
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          className={navBtnClass}
          title={page.isLoading ? 'Loading' : 'Reload'}
          onClick={() => rightDetailsPanelApi.reloadPage(page.id)}
        >
          <RotateCw size={13} className={page.isLoading ? 'animate-spin' : ''} />
        </button>

        {/* URL bar */}
        <div className={`${inputContainerClass} ml-1 min-w-0 flex-1`}>
          {isEditingUrl ? (
            <input
              ref={inputRef}
              type="text"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCommitUrl()
                if (e.key === 'Escape') {
                  setUrlValue(page.url)
                  setIsEditingUrl(false)
                }
              }}
              onBlur={handleCommitUrl}
              spellCheck={false}
              className={`min-w-0 flex-1 border-0 bg-transparent text-[11px] outline-none ${
                isDark ? 'text-zinc-100 placeholder:text-zinc-500' : 'text-zinc-900 placeholder:text-zinc-400'
              }`}
            />
          ) : (
            <span
              className={`min-w-0 flex-1 cursor-text truncate text-[11px] ${
                isDark ? 'text-zinc-400' : 'text-zinc-500'
              }`}
              onClick={() => setIsEditingUrl(true)}
              title={page.url}
            >
              {page.url}
            </span>
          )}
        </div>
      </div>

    </section>
  )
}

// --- Page Dimensions & Device Controls ---

function OrientationIcon({
  category,
  orientation,
  size,
  className,
}: {
  category: string
  orientation: 'portrait' | 'landscape'
  size: number
  className?: string
}) {
  // Smartphone/Tablet glyphs are portrait-native; Monitor is landscape-native.
  const iconIsLandscapeNative = category === 'laptop' || category === 'desktop'
  const shouldRotate =
    iconIsLandscapeNative ? orientation === 'portrait' : orientation === 'landscape'
  const combined = [className, shouldRotate && 'rotate-90'].filter(Boolean).join(' ')
  const isMobile = category === 'iphone'
  const isTablet = category === 'ipad'
  if (isMobile) return <Smartphone size={size} className={combined} />
  if (isTablet) return <Tablet size={size} className={combined} />
  return <Monitor size={size} className={combined} />
}

function DeviceFrameSection({
  page,
  isDark,
  divider,
}: {
  page: DevtoolsPanelPageSummary
  isDark: boolean
  divider: string
}) {
  const orientation = page.deviceOrientation ?? 'portrait'
  const showShell = page.showDeviceFrame ?? false
  const deviceId = page.deviceId ?? null
  const dev = deviceId ? DEVICE_CATALOG.get(deviceId) : null
  const supportsOrientation = !!dev

  const preset = VIEWPORT_PRESETS[page.presetIndex]
  const isCustom = !preset || page.width !== preset.width || page.height !== preset.height
  const triggerLabel = isCustom ? 'Custom' : `${preset.label} (${preset.width}\u00d7${preset.height})`

  const triggerClassName =
    'flex h-7 min-w-0 flex-1 items-center justify-between gap-1 rounded-md border border-[var(--surface-input-border)] bg-[var(--surface-input)] px-2 text-[11px] hover:border-[var(--surface-toolbar-border)]'

  const tabBg = 'bg-[var(--surface-interactive)] border border-[var(--surface-input-border)]'
  const tabActive = isDark
    ? 'bg-[var(--surface-toolbar)] text-zinc-100'
    : 'bg-[var(--surface-input)] text-zinc-800 shadow-sm'
  const tabInactive = isDark
    ? 'text-zinc-500 hover:text-zinc-300'
    : 'text-zinc-400 hover:text-zinc-600'

  return (
    <section className={`border-t ${divider}`}>
      <div className="flex items-center gap-2 px-2 py-2">
        {/* Dimensions dropdown — same options as inline page menu */}
        <PagePresetDropdown
          align="start"
          isDark={isDark}
          side="bottom"
          sideOffset={4}
          onSelectPreset={(index) => rightDetailsPanelApi.setPagePreset(page.id, index)}
          onSelectCustom={() => rightDetailsPanelApi.setPageCustom(page.id)}
          trigger={
            <button type="button" className={triggerClassName}>
              <span className="min-w-0 truncate">{triggerLabel}</span>
              <ChevronDown size={10} className="shrink-0 text-[var(--surface-toolbar-foreground)] opacity-50" />
            </button>
          }
        />

        {/* Orientation icon tabs */}
        {supportsOrientation ? (
          <div className={`flex shrink-0 rounded-md ${tabBg} p-0.5`}>
            <button
              type="button"
              className={`rounded px-1.5 py-1 transition-colors ${
                orientation === 'portrait' ? tabActive : tabInactive
              }`}
              title="Portrait"
              onClick={() => rightDetailsPanelApi.setDeviceOrientation(page.id, 'portrait')}
            >
              <OrientationIcon category={dev!.category} orientation="portrait" size={14} />
            </button>
            <button
              type="button"
              className={`rounded px-1.5 py-1 transition-colors ${
                orientation === 'landscape' ? tabActive : tabInactive
              }`}
              title="Landscape"
              onClick={() => rightDetailsPanelApi.setDeviceOrientation(page.id, 'landscape')}
            >
              <OrientationIcon category={dev!.category} orientation="landscape" size={14} />
            </button>
          </div>
        ) : null}
      </div>

      {/* Show device page checkbox */}
      <div className="flex flex-col gap-1 px-2 pb-2">
        <label className="flex items-center gap-1.5 text-[11px]">
          <input
            type="checkbox"
            checked={showShell}
            onChange={() => rightDetailsPanelApi.toggleDeviceShell(page.id)}
            className="accent-blue-500"
          />
          Show device page
        </label>
        {/* SVG device shell toggle (experimental, hidden for now)
        {showShell && (
          <label className="flex items-center gap-1.5 text-[11px]">
            <input
              type="checkbox"
              checked={page.useSvgDeviceShell ?? false}
              onChange={() => rightDetailsPanelApi.toggleSvgDeviceShell(page.id)}
              className="accent-blue-500"
            />
            SVG device shell
          </label>
        )}
        */}
      </div>
    </section>
  )
}

function PageFavicon({
  faviconUrl,
  label,
  width,
}: {
  faviconUrl?: string | null
  label?: string
  width?: number
}) {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [faviconUrl])

  if (faviconUrl && !imageFailed) {
    return (
      <img
        alt=""
        aria-hidden="true"
        src={faviconUrl}
        className="h-[14px] w-[14px] shrink-0 rounded-[3px]"
        onError={() => setImageFailed(true)}
      />
    )
  }

  const Icon = viewportIcon(label, width)
  return <Icon size={14} className="shrink-0 text-zinc-500" />
}

function viewportIcon(label?: string, width?: number) {
  if (label?.startsWith('iPhone')) return Smartphone
  if (label?.startsWith('iPad')) return Tablet
  if (typeof width !== 'number') return Laptop
  if (width < 600) return Smartphone
  if (width < 1100) return Tablet
  return Laptop
}
