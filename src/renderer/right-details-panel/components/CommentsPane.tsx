import { Fragment, useEffect, useMemo, useRef } from 'react'
import { Collapsible } from '@base-ui/react/collapsible'
import { Popover } from '@base-ui/react/popover'
import { Info, Loader2, MessageCircle, Wrench, X } from 'lucide-react'
import type {
  Annotation,
  DevtoolsPanelFrameSummary,
  FixProgressEntry,
  FixProgressEvent,
  OriginBindings,
} from '../../../shared/types'
import { rightDetailsPanelApi } from '../rightDetailsPanelApi'
import {
  authorLabel,
  formatCommentTime,
} from '../rightDetailsPanelHelpers'
import {
  groupAnnotationsByFrame,
  groupAnnotationsByOrigin,
} from '../rightDetailsPanelSelectors'
import { useFocusedAnnotationScroll } from '../useFocusedAnnotationScroll'
import {
  CircleCheckIcon,
  MoreVerticalIcon,
  TrashIcon,
} from '../../shared/PanelIcons'

export function CommentRow({
  annotation,
  isDark,
  mutedClass,
  rowHoverClass,
  focusRowClass,
  focusedAnnotationId,
  registerAnnotationElement,
  progress,
}: {
  annotation: Annotation
  isDark: boolean
  mutedClass: string
  rowHoverClass: string
  focusRowClass: string
  focusedAnnotationId?: string | null
  registerAnnotationElement: (id: string, element: HTMLElement | null) => void
  progress?: FixProgressEntry
}) {
  const hasScreenshot = !!annotation.metadata?.regionScreenshot
  const progressButton = progress ? (
    <FixProgressButton progress={progress} isDark={isDark} mutedClass={mutedClass} />
  ) : null
  const moreMenu = (
    <Popover.Root>
      <Popover.Trigger
        render={
          <button
            type="button"
            className={`inline-flex size-6 shrink-0 items-center justify-center rounded-md ${
              isDark
                ? 'text-zinc-300 hover:bg-zinc-700'
                : 'text-zinc-600 hover:bg-zinc-200'
            }`}
            aria-label="More actions"
            title="More actions"
          />
        }
      >
        <MoreVerticalIcon className="size-4" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="end">
          <Popover.Popup
            className={`z-30 min-w-[140px] overflow-hidden rounded-md border py-1 shadow-xl ${
              isDark
                ? 'border-zinc-600 bg-zinc-800 text-zinc-200'
                : 'border-zinc-200 bg-white text-zinc-900'
            }`}
          >
            <button
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                isDark ? 'text-zinc-300 hover:bg-white/10 hover:text-zinc-100' : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
              }`}
              onClick={() => {
                rightDetailsPanelApi.resolveAnnotation(annotation.id)
              }}
            >
              <CircleCheckIcon className="size-4" />
              <span>Resolve</span>
            </button>
            <button
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                isDark ? 'text-zinc-300 hover:bg-white/10 hover:text-zinc-100' : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
              }`}
              onClick={() => {
                rightDetailsPanelApi.deleteAnnotation(annotation.id)
              }}
            >
              <TrashIcon className="size-4" />
              <span>Delete</span>
            </button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )

  return (
    <div
      ref={(element) => registerAnnotationElement(annotation.id, element)}
      className={`group/card relative flex flex-col gap-0.5 overflow-hidden rounded-xl border p-1.5 transition-colors ${
        focusedAnnotationId === annotation.id ? focusRowClass : rowHoverClass
      } ${isDark ? 'border-zinc-700/50 bg-zinc-800/60' : 'border-zinc-200 bg-white'}`}
    >
      {hasScreenshot ? (
        <button
          type="button"
          className="relative w-full cursor-pointer"
          onClick={() => rightDetailsPanelApi.openAnnotationThread(annotation.id)}
        >
          <img
            src={`data:image/png;base64,${annotation.metadata!.regionScreenshot}`}
            alt="Region screenshot"
            className="w-full rounded-lg border border-zinc-200/50 bg-zinc-100 dark:border-zinc-700/50 dark:bg-zinc-900"
          />
        </button>
      ) : null}
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover/card:opacity-70 group-hover/card:hover:opacity-100">
        {moreMenu}
      </div>
      <button
        type="button"
        className="w-full cursor-pointer px-1 text-left"
        onClick={() => rightDetailsPanelApi.openAnnotationThread(annotation.id)}
      >
        <div className="inline-flex items-center gap-1.5 text-xs">
          <span className="font-medium">{authorLabel(annotation.author)}</span>
          <span className={mutedClass}>{formatCommentTime(annotation.createdAt)}</span>
        </div>
        <div className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-xs">
          {annotation.text || '(No text)'}
        </div>
        {annotation.replies.length > 0 ? (
          <div className="mt-1 text-xs text-blue-600 dark:text-blue-400">
            {annotation.replies.length} repl{annotation.replies.length === 1 ? 'y' : 'ies'}
          </div>
        ) : null}
      </button>
      {progressButton ? (
        <div className="px-1 pb-0.5">{progressButton}</div>
      ) : null}
    </div>
  )
}

function FixProgressButton({
  progress,
  isDark,
  mutedClass,
}: {
  progress: FixProgressEntry
  isDark: boolean
  mutedClass: string
}) {
  const lastEvent = progress.events[progress.events.length - 1]
  const label = progress.status === 'running'
    ? (lastEvent ? lastEvent.text : 'Starting…')
    : progress.status === 'failed'
      ? (progress.error ?? 'Fix failed')
      : 'Fix log'
  const Icon = progress.status === 'running' ? Loader2 : Info
  const tone = progress.status === 'failed'
    ? (isDark ? 'text-red-300 hover:bg-zinc-700/70' : 'text-red-700 hover:bg-red-50')
    : progress.status === 'running'
      ? (isDark ? 'text-blue-300 hover:bg-zinc-700/70' : 'text-blue-700 hover:bg-blue-50')
      : (isDark ? 'text-zinc-300 hover:bg-zinc-700/70' : 'text-zinc-600 hover:bg-zinc-100')

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <button
            type="button"
            className={`inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] ${tone}`}
            aria-label="Show fix log"
            title="Show fix log"
          />
        }
      >
        <Icon
          size={11}
          className={progress.status === 'running' ? 'animate-spin shrink-0' : 'shrink-0'}
        />
        <span className="truncate">{label}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="start">
          <Popover.Popup
            className={`z-30 flex max-h-[320px] w-[340px] flex-col overflow-hidden rounded-md border shadow-xl ${
              isDark ? 'border-zinc-600 bg-zinc-900 text-zinc-200' : 'border-zinc-200 bg-white text-zinc-900'
            }`}
          >
            <div className={`flex items-center justify-between border-b px-2 py-1.5 text-[11px] ${
              isDark ? 'border-zinc-700 bg-zinc-800/50' : 'border-zinc-200 bg-zinc-50'
            }`}>
              <span className="font-medium">
                {progress.status === 'running' ? 'Running' : progress.status === 'failed' ? 'Failed' : 'Completed'}
              </span>
              <span className={mutedClass}>{progress.events.length} events</span>
            </div>
            {progress.events.length === 0 ? (
              <div className={`px-2 py-3 text-[11px] ${mutedClass}`}>Waiting for output…</div>
            ) : (
              <EventList events={progress.events} isDark={isDark} />
            )}
            {progress.error ? (
              <div className={`border-t px-2 py-1.5 text-[11px] ${
                isDark ? 'border-zinc-700 bg-red-900/20 text-red-300' : 'border-zinc-200 bg-red-50 text-red-700'
              }`}>
                {progress.error}
              </div>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

function EventList({ events, isDark }: { events: FixProgressEvent[]; isDark: boolean }) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const eventCount = events.length
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [eventCount])

  const kindColor: Record<FixProgressEvent['kind'], string> = {
    system: isDark ? 'text-zinc-500' : 'text-zinc-500',
    text: isDark ? 'text-zinc-200' : 'text-zinc-800',
    tool_use: isDark ? 'text-blue-300' : 'text-blue-700',
    tool_result: isDark ? 'text-emerald-300' : 'text-emerald-700',
    result: isDark ? 'text-zinc-100' : 'text-zinc-900',
    stderr: isDark ? 'text-amber-300' : 'text-amber-700',
    error: isDark ? 'text-red-300' : 'text-red-700',
  }
  const kindLabelClass = isDark ? 'text-zinc-600' : 'text-zinc-400'

  return (
    <div
      ref={scrollRef}
      className="grid flex-1 auto-rows-min grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0 overflow-auto px-2 py-1.5 font-mono text-[11px] leading-relaxed"
    >
      {events.map((event, i) => (
        <Fragment key={`${event.timestamp}-${i}`}>
          <span className={kindLabelClass}>{event.kind.replace('_', ' ')}</span>
          <span className={`break-words ${kindColor[event.kind]}`}>{event.text}</span>
        </Fragment>
      ))}
    </div>
  )
}

export function CommentsPane({
  isDark,
  annotations,
  frames,
  focusedAnnotationId,
  annotateEnabled,
  annotateAvailable,
  originBindings,
  fixInProgress,
  fixProgress,
}: {
  isDark: boolean
  annotations: Annotation[]
  frames: DevtoolsPanelFrameSummary[]
  focusedAnnotationId?: string | null
  annotateEnabled: boolean
  annotateAvailable: boolean
  originBindings: OriginBindings
  fixInProgress: Record<string, number>
  fixProgress: Record<string, FixProgressEntry>
}) {
  const mutedClass = isDark ? 'text-zinc-400' : 'text-zinc-500'
  const dividerClass = isDark ? 'border-zinc-700/50' : 'border-zinc-200/80'
  const rowHoverClass = isDark ? 'hover:bg-zinc-700/55' : 'hover:border-zinc-300'
  const focusRowClass = isDark ? 'bg-blue-500/20' : 'bg-blue-500/10'
  const groups = useMemo(() => groupAnnotationsByFrame(annotations, frames), [annotations, frames])
  const originGroups = useMemo(() => groupAnnotationsByOrigin(annotations), [annotations])
  const { registerAnnotationElement } = useFocusedAnnotationScroll(
    focusedAnnotationId,
    annotations,
  )

  return (
    <section className="px-2 pt-1 pb-3">
      {originGroups.length > 0 ? (
        <div className={`mb-2 space-y-1.5 border-b pb-2 ${dividerClass}`}>
          {originGroups.map((group) => (
            <OriginSection
              key={group.origin}
              origin={group.origin}
              unresolvedCount={group.unresolvedCount}
              binding={originBindings[group.origin]}
              inFlight={fixInProgress[group.origin] ?? 0}
              isDark={isDark}
              mutedClass={mutedClass}
            />
          ))}
        </div>
      ) : null}
      {!groups.some((g) => g.unresolved.length > 0) ? (
        <div
          className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-6 ${
            isDark ? 'border-zinc-600' : 'border-zinc-300'
          }`}
        >
          <span className={`text-xs ${mutedClass}`}>No unresolved comments</span>
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium ${
              annotateEnabled
                ? isDark
                  ? 'border-blue-500 bg-blue-600 text-white'
                  : 'border-blue-200 bg-blue-50 text-blue-700'
                : isDark
                  ? 'border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                  : 'border-zinc-300 bg-zinc-50 text-zinc-700 hover:bg-zinc-200'
            } disabled:pointer-events-none disabled:opacity-45`}
            onClick={() => rightDetailsPanelApi.toggleAnnotateMode()}
            disabled={!annotateAvailable}
          >
            <MessageCircle size={14} />
            <span>Add comments</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.filter((g) => g.unresolved.length > 0).map((group, index) => (
              <section
                key={group.frameKey}
                className={index === 0 ? '' : `border-t pt-2 ${dividerClass}`}
              >
                <div className="space-y-2">
                  {group.unresolved.map((annotation) => (
                    <CommentRow
                      key={annotation.id}
                      annotation={annotation}
                      isDark={isDark}
                      mutedClass={mutedClass}
                      rowHoverClass={rowHoverClass}
                      focusRowClass={focusRowClass}
                      focusedAnnotationId={focusedAnnotationId}
                      registerAnnotationElement={registerAnnotationElement}
                      progress={fixProgress[annotation.id]}
                    />
                  ))}
                </div>
              </section>
          ))}

        </div>
      )}
    </section>
  )
}

function OriginSection({
  origin,
  unresolvedCount,
  binding,
  inFlight,
  isDark,
  mutedClass,
}: {
  origin: string
  unresolvedCount: number
  binding: OriginBindings[string] | undefined
  inFlight: number
  isDark: boolean
  mutedClass: string
}) {
  const fixDisabled = !binding || unresolvedCount === 0 || inFlight > 0
  const fixLabel = inFlight > 0
    ? `Fixing ${inFlight}…`
    : `Fix ${unresolvedCount} comment${unresolvedCount === 1 ? '' : 's'}`
  const displayRepo = binding ? shortenPath(binding.repoPath) : null

  return (
    <div
      className={`flex flex-col gap-1 rounded-md border px-2 py-1.5 text-xs ${
        isDark ? 'border-zinc-700/60 bg-zinc-800/40' : 'border-zinc-200 bg-zinc-50'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="truncate font-medium" title={origin}>{origin}</span>
        {binding ? (
          <button
            type="button"
            className={`ml-auto inline-flex size-4 shrink-0 items-center justify-center rounded ${
              isDark ? 'text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200' : 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700'
            }`}
            title="Unlink repo"
            onClick={() => rightDetailsPanelApi.removeOriginBinding(origin)}
          >
            <X size={10} />
          </button>
        ) : null}
      </div>
      {binding ? (
        <>
          <div className={`truncate ${mutedClass}`} title={binding.repoPath}>
            {displayRepo}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <button
              type="button"
              disabled={fixDisabled}
              onClick={() => rightDetailsPanelApi.triggerFixComments(origin)}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium disabled:opacity-45 ${
                isDark
                  ? 'border-blue-500/70 bg-blue-600/80 text-white hover:bg-blue-600'
                  : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              <Wrench size={11} />
              <span>{fixLabel}</span>
            </button>
            <label className={`ml-auto inline-flex items-center gap-1 ${mutedClass}`}>
              <input
                type="checkbox"
                checked={binding.autoFix}
                onChange={(event) =>
                  rightDetailsPanelApi.setAutoFix(origin, event.currentTarget.checked)
                }
              />
              <span>Auto-fix</span>
            </label>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => rightDetailsPanelApi.pickRepoForOrigin(origin)}
          className={`inline-flex items-center gap-1 self-start rounded-md border px-2 py-1 text-[11px] font-medium ${
            isDark
              ? 'border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
              : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100'
          }`}
        >
          Link repo…
        </button>
      )}
    </div>
  )
}

function shortenPath(path: string): string {
  const segments = path.split('/').filter(Boolean)
  if (segments.length <= 2) return path
  return '…/' + segments.slice(-2).join('/')
}
