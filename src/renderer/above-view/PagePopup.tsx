/**
 * PagePopup — selection-driven popup for page entities (ADR 0006). Adds the
 * page kind's popup surface (URL + nav + dup + del on single-select; dup + del
 * only on multi-select) alongside the existing `PageChrome`. Per ADR §6, the
 * URL/nav redundancy between chrome and popup is acceptable for now; a future
 * ADR may consolidate.
 *
 * Mounts on single OR same-kind multi-select (ADR 0006 §4). URL editing and
 * nav buttons hide when multi — those don't have a meaningful multi-page
 * semantic. Dup/del fan out across the selection.
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, RotateCw, Trash2 } from 'lucide-react'
import { POPUP_SHOW_DELAY_MS } from '../../shared/popupTiming'
import { normalizeUserUrl } from '../../shared/url'
import type {
  CanvasBgElectronAPI,
  CanvasScenePageEntity,
  LayoutUpdateData,
} from '../../shared/types'
import { CanvasItemPopup } from './CanvasItemPopup'

const POPUP_OFFSET_Y = 14
const URL_INPUT_MIN_WIDTH = 280

export function PagePopup({
  api,
  isDark,
  layout,
  selectedPages,
  interactionIdle,
}: {
  api: Pick<
    CanvasBgElectronAPI,
    | 'duplicatePage'
    | 'deletePage'
    | 'navigatePage'
    | 'goBackPage'
    | 'goForwardPage'
    | 'reloadPage'
  >
  isDark: boolean
  layout: LayoutUpdateData
  selectedPages: CanvasScenePageEntity[]
  interactionIdle: boolean
}) {
  const count = selectedPages.length
  const ids = selectedPages.map((p) => p.id).join('|')
  const shouldQueue = interactionIdle && count > 0
  const [delayedKey, setDelayedKey] = useState<string | null>(null)
  useEffect(() => {
    if (!shouldQueue) {
      setDelayedKey(null)
      return
    }
    const timeoutId = window.setTimeout(() => {
      setDelayedKey(ids)
    }, POPUP_SHOW_DELAY_MS)
    return () => window.clearTimeout(timeoutId)
  }, [shouldQueue, ids])

  // URL draft local to single-select; commits via blur/Enter. The navigate IPC
  // → broadcast round-trip takes a frame, so after commit we hold the optimistic
  // value in `draftUrl` and clear it once `single.url` catches up.
  const [draftUrl, setDraftUrl] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const single = count === 1 ? selectedPages[0] : null
  const currentUrl = single?.url
  useEffect(() => {
    if (draftUrl !== null && currentUrl === draftUrl) setDraftUrl(null)
  }, [currentUrl, draftUrl])

  if (count === 0) return null
  const open = delayedKey === ids
  const isSingle = count === 1
  const isBlank = single ? single.url === 'about:blank' : false
  const displayUrl = single ? (isBlank ? '' : single.url) : ''
  const value = draftUrl !== null ? draftUrl : displayUrl

  const commitUrl = () => {
    if (!single || draftUrl === null) return
    const trimmed = draftUrl.trim()
    if (!trimmed || trimmed === single.url) {
      setDraftUrl(null)
      return
    }
    const normalized = normalizeUserUrl(trimmed)
    setDraftUrl(normalized)
    api.navigatePage(single.id, normalized)
  }

  const entityIds = selectedPages.map((p) => p.id)
  const noun = isSingle ? 'page' : `${count} pages`

  return (
    <CanvasItemPopup.Root
      entityIds={entityIds}
      layout={layout}
      open={open}
      placement="above"
      offset={POPUP_OFFSET_Y}
    >
      <CanvasItemPopup.Frame isDark={isDark}>
        {isSingle && single ? (
          <>
            <CanvasItemPopup.Section>
              <CanvasItemPopup.IconButton
                isDark={isDark}
                title="Back"
                ariaLabel="Go back"
                onClick={() => api.goBackPage(single.id)}
              >
                <ChevronLeft
                  size={14}
                  style={!single.canGoBack ? { opacity: 0.3 } : undefined}
                />
              </CanvasItemPopup.IconButton>
              <CanvasItemPopup.IconButton
                isDark={isDark}
                title="Forward"
                ariaLabel="Go forward"
                onClick={() => api.goForwardPage(single.id)}
              >
                <ChevronRight
                  size={14}
                  style={!single.canGoForward ? { opacity: 0.3 } : undefined}
                />
              </CanvasItemPopup.IconButton>
              <CanvasItemPopup.IconButton
                isDark={isDark}
                title={single.isLoading ? 'Loading…' : 'Reload'}
                ariaLabel="Reload page"
                onClick={() => api.reloadPage(single.id)}
              >
                <RotateCw size={12} className={single.isLoading ? 'animate-spin' : ''} />
              </CanvasItemPopup.IconButton>
            </CanvasItemPopup.Section>
            <CanvasItemPopup.Section>
              <input
                ref={inputRef}
                type="text"
                value={value}
                placeholder="Type a URL"
                onChange={(e) => setDraftUrl(e.target.value)}
                onBlur={commitUrl}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitUrl()
                    inputRef.current?.blur()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setDraftUrl(null)
                    inputRef.current?.blur()
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className={`min-w-0 rounded-[6px] border px-2 py-1 text-xs outline-none focus:ring-1 ${
                  isDark
                    ? 'border-zinc-700 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500 focus:ring-blue-500/40'
                    : 'border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400 focus:ring-blue-500/40'
                }`}
                style={{ minWidth: URL_INPUT_MIN_WIDTH }}
              />
            </CanvasItemPopup.Section>
          </>
        ) : null}
        <CanvasItemPopup.Section>
          <CanvasItemPopup.IconButton
            isDark={isDark}
            title={`Duplicate ${noun}`}
            ariaLabel={`Duplicate ${noun}`}
            onClick={() => {
              for (const p of selectedPages) api.duplicatePage(p.id)
            }}
          >
            <Copy size={14} />
          </CanvasItemPopup.IconButton>
          <CanvasItemPopup.DestructiveButton
            isDark={isDark}
            title={`Delete ${noun}`}
            ariaLabel={`Delete ${noun}`}
            onClick={() => {
              for (const p of selectedPages) api.deletePage(p.id)
            }}
          >
            <Trash2 size={14} />
          </CanvasItemPopup.DestructiveButton>
        </CanvasItemPopup.Section>
      </CanvasItemPopup.Frame>
    </CanvasItemPopup.Root>
  )
}
