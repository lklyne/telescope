import type { Annotation, LayoutUpdateData, WorkspaceBounds } from '../../shared/types'
import { canvasRectToScreenRect, type PendingAnnotation } from './annotationMath'
import { CircleCheckIcon, MoreVerticalIcon, TrashIcon } from '../shared/PanelIcons'
import { CommentBubble, CommentInput } from '../shared/CommentPrimitives'

export function PendingCommentComposer({
  clearDraft,
  commentInputRef,
  commentText,
  pendingAnnotation,
  resizeCommentInput,
  setCommentText,
  submitPendingAnnotation,
}: {
  clearDraft: () => void
  commentInputRef: React.RefObject<HTMLTextAreaElement | null>
  commentText: string
  pendingAnnotation: PendingAnnotation | null
  resizeCommentInput: () => void
  setCommentText: React.Dispatch<React.SetStateAction<string>>
  submitPendingAnnotation: () => void
}) {
  if (!pendingAnnotation) return null

  return (
    <div
      className="pointer-events-auto absolute z-50"
      data-overlay-ui
      style={{
        left: pendingAnnotation.composerX,
        top: pendingAnnotation.composerY,
        width: pendingAnnotation.composerWidth,
      }}
    >
      <div className="flex items-center gap-2 rounded-[8px] border border-[var(--surface-popover-border)] bg-[var(--surface-popover-subtle)] py-1.5 pl-3 pr-2 shadow-lg">
        <CommentInput
          inputRef={commentInputRef}
          autoFocus
          value={commentText}
          onChange={(value) => { setCommentText(value); resizeCommentInput() }}
          onSubmit={submitPendingAnnotation}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); clearDraft() }
            event.stopPropagation()
          }}
        />
      </div>
    </div>
  )
}

const REGION_COMPOSER_WIDTH = 320
const REGION_COMPOSER_MARGIN = 12

export function RegionSelectComposer({
  canvasRect,
  clearDraft,
  commentInputRef,
  commentText,
  layoutData,
  resizeCommentInput,
  setCommentText,
  submitRegionAnnotation,
}: {
  canvasRect: WorkspaceBounds
  clearDraft: () => void
  commentInputRef: React.RefObject<HTMLTextAreaElement | null>
  commentText: string
  layoutData: LayoutUpdateData
  resizeCommentInput: () => void
  setCommentText: React.Dispatch<React.SetStateAction<string>>
  submitRegionAnnotation: () => void
}) {
  const screen = canvasRectToScreenRect(layoutData, canvasRect)
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
      <div
        className="pointer-events-auto absolute z-50"
        data-overlay-ui
        style={{ left: composerX, top: composerY, width: REGION_COMPOSER_WIDTH }}
      >
        <div className="flex items-center gap-2 rounded-[8px] border border-[var(--surface-popover-border)] bg-[var(--surface-popover-subtle)] py-1.5 pl-3 pr-2 shadow-lg">
          <CommentInput
            inputRef={commentInputRef}
            autoFocus
            value={commentText}
            onChange={(value) => { setCommentText(value); resizeCommentInput() }}
            onSubmit={submitRegionAnnotation}
            submitLabel="Submit region annotation"
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); clearDraft() }
              event.stopPropagation()
            }}
          />
        </div>
      </div>
    </>
  )
}

export function AnnotationThreadPopover({
  api,
  closeThread,
  drawCursor,
  drawInteractionEnabled,
  openThread,
  openThreadMenu,
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
