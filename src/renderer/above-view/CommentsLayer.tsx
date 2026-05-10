import type { Annotation, FixProgressEntry, LayoutUpdateData, WorkspaceBounds } from '../../shared/types'
import { canvasRectToScreenRect, type PendingAnnotation } from './annotationMath'
import { CircleCheckIcon, MoreVerticalIcon, TrashIcon } from '../shared/PanelIcons'
import { CommentBubble, CommentInput } from '../shared/CommentPrimitives'
import { FixEventList, fixStatusLabel } from '../shared/FixEventList'

const REGION_COMPOSER_WIDTH = 320
const REGION_COMPOSER_MARGIN = 12

/**
 * Single pending-annotation composer (ADR 0006). One component handles all
 * three anchor types — element, canvas-point, region — with placement keyed
 * off the anchor: above-right of the element bbox, adjacent to the click
 * point, or above-right of the region rect. Element/canvas-point drafts
 * arrive via `pendingAnnotation`; region drafts arrive via
 * `pendingRegionRect`. Only one is set at a time.
 */
export function PendingAnnotationComposer({
  clearDraft,
  commentInputRef,
  commentText,
  layoutData,
  pendingAnnotation,
  pendingRegionRect,
  resizeCommentInput,
  setCommentText,
  submitPendingAnnotation,
  submitRegionAnnotation,
}: {
  clearDraft: () => void
  commentInputRef: React.RefObject<HTMLTextAreaElement | null>
  commentText: string
  layoutData: LayoutUpdateData
  pendingAnnotation: PendingAnnotation | null
  pendingRegionRect: WorkspaceBounds | null
  resizeCommentInput: () => void
  setCommentText: React.Dispatch<React.SetStateAction<string>>
  submitPendingAnnotation: () => void
  submitRegionAnnotation: () => void
}) {
  if (pendingAnnotation) {
    return (
      <ComposerBox
        clearDraft={clearDraft}
        commentInputRef={commentInputRef}
        commentText={commentText}
        left={pendingAnnotation.composerX}
        top={pendingAnnotation.composerY}
        width={pendingAnnotation.composerWidth}
        resizeCommentInput={resizeCommentInput}
        setCommentText={setCommentText}
        submit={submitPendingAnnotation}
        submitLabel="Submit comment"
      />
    )
  }
  if (pendingRegionRect) {
    const screen = canvasRectToScreenRect(layoutData, pendingRegionRect)
    const overlayTop = screen.top - layoutData.canvasOrigin.y
    const composerX = Math.min(
      Math.max(screen.left, 8),
      window.innerWidth - REGION_COMPOSER_WIDTH - 8,
    )
    const composerY = overlayTop + screen.height + REGION_COMPOSER_MARGIN
    return (
      <>
        <div
          className="pointer-events-none absolute rounded border-2 border-dashed border-rose-400/80 bg-rose-400/10"
          style={{ left: screen.left, top: overlayTop, width: screen.width, height: screen.height }}
        />
        <ComposerBox
          clearDraft={clearDraft}
          commentInputRef={commentInputRef}
          commentText={commentText}
          left={composerX}
          top={composerY}
          width={REGION_COMPOSER_WIDTH}
          resizeCommentInput={resizeCommentInput}
          setCommentText={setCommentText}
          submit={submitRegionAnnotation}
          submitLabel="Submit region annotation"
        />
      </>
    )
  }
  return null
}

function ComposerBox({
  clearDraft,
  commentInputRef,
  commentText,
  left,
  top,
  width,
  resizeCommentInput,
  setCommentText,
  submit,
  submitLabel,
}: {
  clearDraft: () => void
  commentInputRef: React.RefObject<HTMLTextAreaElement | null>
  commentText: string
  left: number
  top: number
  width: number
  resizeCommentInput: () => void
  setCommentText: React.Dispatch<React.SetStateAction<string>>
  submit: () => void
  submitLabel?: string
}) {
  return (
    <div
      className="pointer-events-auto absolute z-50"
      data-overlay-ui
      style={{ left, top, width }}
    >
      <div className="flex items-center gap-2 rounded-[8px] border border-[var(--surface-popover-border)] bg-[var(--surface-popover-subtle)] py-1.5 pl-3 pr-2 shadow-lg">
        <CommentInput
          inputRef={commentInputRef}
          autoFocus
          value={commentText}
          onChange={(value) => { setCommentText(value); resizeCommentInput() }}
          onSubmit={submit}
          submitLabel={submitLabel}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); clearDraft() }
            event.stopPropagation()
          }}
        />
      </div>
    </div>
  )
}

export function AnnotationThreadPopover({
  api,
  closeThread,
  drawCursor,
  drawInteractionEnabled,
  openThread,
  openThreadMenu,
  progress,
  replyText,
  setOpenThreadMenu,
  setReplyText,
  startAnnotationDrag,
  submitThreadReply,
  threadInputRef,
  threadPosition,
}: {
  api: { deleteAnnotation: (annotationId: string) => void; resolveAnnotation: (annotationId: string) => void }
  closeThread: () => void
  drawCursor: string
  drawInteractionEnabled: boolean
  openThread: Annotation | null
  openThreadMenu: boolean
  progress?: FixProgressEntry
  replyText: string
  setOpenThreadMenu: React.Dispatch<React.SetStateAction<boolean>>
  setReplyText: React.Dispatch<React.SetStateAction<string>>
  startAnnotationDrag: (event: React.PointerEvent<HTMLElement>, annotationId: string) => void
  submitThreadReply: () => void
  threadInputRef: React.RefObject<HTMLTextAreaElement | null>
  threadPosition: { left: number; top: number; width: number } | null
}) {
  if (!openThread || !threadPosition) return null

  return (
    <>
      <div
        className="pointer-events-auto absolute inset-0 z-40"
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return
          closeThread()
        }}
      />
      <div
        className="pointer-events-auto absolute z-50"
        data-overlay-ui
        style={{
          left: threadPosition.left,
          top: threadPosition.top,
          width: threadPosition.width,
        }}
      >
        <div className="rounded-2xl border border-[var(--surface-popover-border)] bg-[var(--surface-popover-subtle)] text-zinc-900 shadow-xl dark:text-zinc-100">
          <div
            className="flex items-center justify-between border-b border-zinc-200 px-2.5 py-1.5 dark:border-zinc-700"
            style={{
              cursor:
                openThread.anchor.type === 'canvas'
                  ? drawInteractionEnabled
                    ? drawCursor
                    : 'grab'
                  : drawInteractionEnabled
                    ? drawCursor
                    : undefined,
            }}
            onPointerDown={(event) => {
              if (openThread.anchor.type !== 'canvas') return
              if ((event.target as Element | null)?.closest('button')) return
              startAnnotationDrag(event, openThread.id)
            }}
          >
            <div className="text-[12px] font-semibold">Comment</div>
            <div className="flex items-center gap-1">
              <div className="relative">
                <button
                  type="button"
                  data-overlay-ui
                  className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 hover:bg-[var(--surface-popover)] dark:text-zinc-300 dark:hover:bg-[var(--surface-popover)]"
                  aria-label="More actions"
                  title="More actions"
                  onClick={() => setOpenThreadMenu((current) => !current)}
                >
                  <MoreVerticalIcon />
                </button>
                {openThreadMenu ? (
                  <div
                    data-overlay-ui
                    className="absolute right-0 top-8 z-[60] min-w-40 rounded-[10px] border border-[var(--surface-popover-border)] bg-[var(--surface-popover-subtle)] p-1 text-zinc-900 shadow-xl dark:text-zinc-100"
                  >
                    <button
                      type="button"
                      data-overlay-ui
                      className="flex w-full cursor-default items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left text-xs text-zinc-900 hover:bg-[var(--surface-popover)] dark:text-zinc-100 dark:hover:bg-[var(--surface-popover)]"
                      onClick={() => {
                        setOpenThreadMenu(false)
                        api.resolveAnnotation(openThread.id)
                        closeThread()
                      }}
                    >
                      <CircleCheckIcon className="size-3" />
                      <span>Resolve</span>
                    </button>
                    <button
                      type="button"
                      data-overlay-ui
                      className="flex w-full cursor-default items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left text-xs text-zinc-900 hover:bg-[var(--surface-popover)] dark:text-zinc-100 dark:hover:bg-[var(--surface-popover)]"
                      onClick={() => {
                        setOpenThreadMenu(false)
                        api.deleteAnnotation(openThread.id)
                        closeThread()
                      }}
                    >
                      <TrashIcon className="size-3" />
                      <span>Delete</span>
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 hover:bg-[var(--surface-popover)] dark:text-zinc-300 dark:hover:bg-[var(--surface-popover)]"
                onClick={closeThread}
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>
          <div className="max-h-[320px] space-y-2.5 overflow-auto px-2.5 py-2.5">
            <CommentBubble author={openThread.author} text={openThread.text} fallback="Drawing feedback" />
            {openThread.replies.map((reply, idx) => (
              <CommentBubble key={`${openThread.id}:reply:${idx}`} author={reply.author} text={reply.text} />
            ))}
          </div>
          {progress ? (
            <ThreadFixProgress progress={progress} />
          ) : null}
          <div className="border-t border-zinc-200 px-2.5 py-2.5 dark:border-zinc-700">
            <div className="flex items-center gap-2 rounded-[16px] border border-zinc-300 bg-zinc-50 py-1.5 pl-2.5 pr-1.5 dark:border-zinc-600 dark:bg-zinc-900/40">
              <CommentInput
                inputRef={threadInputRef}
                value={replyText}
                onChange={setReplyText}
                onSubmit={submitThreadReply}
                placeholder="Reply"
                submitLabel="Send reply"
                buttonClassName="bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function ThreadFixProgress({ progress }: { progress: FixProgressEntry }) {
  const eventCount = progress.events.length

  const statusLabel = fixStatusLabel(progress.status)

  const statusColor =
    progress.status === 'running'
      ? 'text-blue-600 dark:text-blue-400'
      : progress.status === 'failed'
        ? 'text-red-600 dark:text-red-400'
        : 'text-emerald-600 dark:text-emerald-400'

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-700">
      <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px]">
        <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
        <span className="text-zinc-400 dark:text-zinc-500">
          {eventCount} event{eventCount === 1 ? '' : 's'}
        </span>
      </div>
      {eventCount > 0 ? (
        <FixEventList events={progress.events} className="max-h-[160px] px-2.5 pb-2" />
      ) : (
        <div className="px-2.5 pb-2 text-[11px] text-zinc-400 dark:text-zinc-500">
          Waiting for output…
        </div>
      )}
      {progress.error ? (
        <div className="border-t border-zinc-200 px-2.5 py-1.5 text-[11px] text-red-700 dark:border-zinc-700 dark:text-red-300">
          {progress.error}
        </div>
      ) : null}
    </div>
  )
}
