import { ipcRenderer } from 'electron'
import type { Annotation, AnnotationMode, ScrollSyncData } from '../shared/types'
import { PRESENCE_SCROLL_ANIMATION_MS } from '../shared/presence-timing'

import {
  getInspectableElementByNodeId,
  initComponentInspector,
} from './component-inspector'
import {
  hideCommentBadgeHover,
  isCommentHoverActive,
  queueRenderCommentBadges,
  renderCommentBadges,
  setPageAnnotations,
} from './comment-badges'
import {
  buildElementPath,
  buildStructuredDomSnapshot,
  compactText,
  deepElementFromPoint,
  inspectionPayload,
  isInteractiveForSnapshot,
  isVisibleForSnapshot,
} from './dom-element-utils'
import {
  applyDomInspectionState,
  ensureDomInspectionOverlay,
  handleInspectFocusNode,
  hideDomInspectionOverlay,
  isDomInspectionEnabled,
  getDomInspectionLastTarget,
  emitHoveredElement,
  queueRefreshDomInspectionOverlay,
  setDomInspectionEnabled,
  updateDomInspectionOverlay,
} from './dom-inspection'
import {
  forwardMiddleDragPan,
  forwardViewportWheel,
  isPageOverlayTarget,
} from './gesture-forwarding'
import {
  applyIncomingLinkedScroll,
  clearScrollSuppression,
  queueScrollSyncBroadcast,
  seedScrollSyncBaseline,
  stopFollowerAnimation,
} from './scroll-sync-handler'

let interactive = false
let multiSelected = false
let canvasZoom = 1
let annotateEnabled = false
let annotationMode: AnnotationMode = 'off'
let cleanupBlockingOverlayListeners: (() => void) | null = null
const SELECTION_DEBUG = process.env.CANVAS_DEBUG_SELECTION === '1'

function selectionDebug(event: string, details?: Record<string, unknown>): void {
  if (!SELECTION_DEBUG) return
  console.log('[selection-debug:page-content]', {
    ts: Date.now(),
    event,
    interactive,
    domInspectionEnabled: isDomInspectionEnabled(),
    annotateEnabled,
    ...details,
  })
}

// --- Debug log forwarding ---

function serializeDebugArg(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value
  }
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return String(value)
  }
}

function debugLog(level: 'log' | 'warn' | 'error', ...args: unknown[]): void {
  ipcRenderer.send('debug-log', {
    source: 'page-content',
    level,
    args: args.map(serializeDebugArg),
  })
}

window.addEventListener('error', (event) => {
  debugLog('error', event.message, event.filename, event.lineno, event.colno)
})

window.addEventListener('unhandledrejection', (event) => {
  debugLog('error', 'unhandledrejection', event.reason)
})

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

console.log = (...args: unknown[]) => {
  originalConsole.log(...args)
  debugLog('log', ...args)
}

console.warn = (...args: unknown[]) => {
  originalConsole.warn(...args)
  debugLog('warn', ...args)
}

console.error = (...args: unknown[]) => {
  originalConsole.error(...args)
  debugLog('error', ...args)
}

// --- Annotate mode ---

function handleAnnotateClick(event: MouseEvent): void {
  if (!annotateEnabled) return
  const target = deepElementFromPoint(event.clientX, event.clientY)
  if (!target) return
  if (isPageOverlayTarget(target)) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
  const payload = inspectionPayload(target)
  ipcRenderer.send('annotate-element-select', {
    ...payload,
  })
}

function handleAnnotateMouseDown(event: MouseEvent): void {
  if (!annotateEnabled) return
  const target = deepElementFromPoint(event.clientX, event.clientY)
  if (isPageOverlayTarget(target)) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

function handleAnnotateMove(event: MouseEvent): void {
  if (!annotateEnabled) return
  const target = deepElementFromPoint(event.clientX, event.clientY)
  if (isPageOverlayTarget(target)) {
    hideDomInspectionOverlay()
    return
  }
  if (target) {
    const payload = inspectionPayload(target)
    updateDomInspectionOverlay(target, payload)
  } else {
    hideDomInspectionOverlay()
  }
}

function handleAnnotateLeave(): void {
  if (!annotateEnabled) return
  hideDomInspectionOverlay()
}

function applyAnnotateState(): void {
  window.removeEventListener('mousemove', handleAnnotateMove, true)
  window.removeEventListener('mousedown', handleAnnotateMouseDown, true)
  window.removeEventListener('click', handleAnnotateClick, true)
  window.removeEventListener('mouseleave', handleAnnotateLeave, true)
  if (annotateEnabled) {
    ensureDomInspectionOverlay()
    window.addEventListener('mousemove', handleAnnotateMove, true)
    window.addEventListener('mousedown', handleAnnotateMouseDown, true)
    window.addEventListener('click', handleAnnotateClick, true)
    window.addEventListener('mouseleave', handleAnnotateLeave, true)
  } else {
    hideDomInspectionOverlay()
  }
}

// Intercept canvas-level wheel events on page content views.
// Cmd/Ctrl + wheel (or trackpad pinch-to-zoom) should zoom the canvas, not the page.
window.addEventListener(
  'wheel',
  (e: WheelEvent) => {
    if (!e.metaKey && !e.ctrlKey) return
    e.preventDefault()
    forwardViewportWheel(e, canvasZoom)
  },
  { passive: false, capture: true }
)

// --- Selection overlay ---
// When the page is not interactive, inject an overlay that blocks native page
// input and forwards only native/page-neutral viewport affordances. Canvas
// selection, drag, resize, marquee, placement, and edge gestures are owned by
// aboveView's canvas pointer router.

function injectBlockingOverlay(): void {
  const overlayMode = annotationMode === 'region_select' ? 'region_select' : 'default'
  const existingOverlay = document.getElementById('__canvas-blocking-overlay')
  if (
    existingOverlay instanceof HTMLDivElement &&
    existingOverlay.dataset.overlayKind === 'blocking' &&
    existingOverlay.dataset.overlayMode === overlayMode
  ) {
    return
  }
  removeBlockingOverlay()
  selectionDebug('inject-blocking-overlay')

  const overlay = document.createElement('div')
  overlay.id = '__canvas-blocking-overlay'
  overlay.dataset.overlayKind = 'blocking'
  overlay.dataset.overlayMode = overlayMode
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    zIndex: '2147483646',
    background: 'transparent',
    cursor: 'default',
  })

  overlay.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button === 0) {
      selectionDebug('overlay-mousedown-left-suppressed', {
        clientX: e.clientX,
        clientY: e.clientY,
      })
      e.preventDefault()
      e.stopPropagation()
    }
  })

  // Middle-click pan forwarding
  let middleDrag: { screenX: number; screenY: number } | null = null

  overlay.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 1) return
    e.preventDefault()
    e.stopPropagation()
    middleDrag = { screenX: e.screenX, screenY: e.screenY }
  })

  overlay.addEventListener('mousemove', (e: MouseEvent) => {
    if (!middleDrag) return
    e.preventDefault()
    e.stopPropagation()
    middleDrag = forwardMiddleDragPan(middleDrag, e)
  })

  const handleWindowMouseUp = (e: MouseEvent) => {
    if (e.button !== 1) return
    middleDrag = null
  }
  window.addEventListener('mouseup', handleWindowMouseUp)

  // Hover state forwarding
  overlay.addEventListener('mouseenter', () => {
    ipcRenderer.send('frame-hover', true)
  })

  overlay.addEventListener('mouseleave', () => {
    ipcRenderer.send('frame-hover', false)
    middleDrag = null
  })

  // Forward wheel events to canvas operations
  overlay.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      forwardViewportWheel(e, canvasZoom)
    },
    { passive: false }
  )

  document.body.appendChild(overlay)
  cleanupBlockingOverlayListeners = () => {
    middleDrag = null
    window.removeEventListener('mouseup', handleWindowMouseUp)
  }
}

function removeBlockingOverlay(): void {
  if (cleanupBlockingOverlayListeners) {
    cleanupBlockingOverlayListeners()
    cleanupBlockingOverlayListeners = null
  }
  const overlay = document.getElementById('__canvas-blocking-overlay')
  if (overlay) {
    selectionDebug('remove-blocking-overlay')
    overlay.remove()
  }
}

function applyInteractiveState(): void {
  selectionDebug('applyInteractiveState')
  if (isDomInspectionEnabled() || annotateEnabled) {
    removeBlockingOverlay()
  } else if (interactive) {
    removeBlockingOverlay()
  } else if (multiSelected) {
    injectBlockingOverlay()
  } else {
    injectBlockingOverlay()
  }
}

// --- IPC handlers ---

ipcRenderer.on('set-interactive', (_event, value: boolean) => {
  const wasInteractive = interactive
  selectionDebug('ipc:set-interactive', { value, wasInteractive })
  interactive = value
  if (interactive && !wasInteractive) {
    stopFollowerAnimation()
    clearScrollSuppression()
    seedScrollSyncBaseline()
  }
  applyInteractiveState()
  renderCommentBadges()
})

ipcRenderer.on('set-canvas-zoom', (_event, value: number) => {
  canvasZoom = value
})

ipcRenderer.on('set-multi-selected', (_event, value: boolean) => {
  selectionDebug('ipc:set-multi-selected', { value })
  multiSelected = value
  applyInteractiveState()
})

ipcRenderer.on('set-annotate-mode', (_event, payload: { enabled?: boolean; mode?: AnnotationMode } | undefined) => {
  selectionDebug('ipc:set-annotate-mode', {
    enabled: Boolean(payload?.enabled),
    mode: payload?.mode ?? 'off',
  })
  annotateEnabled = Boolean(payload?.enabled)
  annotationMode = payload?.mode ?? 'off'
  applyAnnotateState()
  applyInteractiveState()
})

ipcRenderer.on('annotate-clear-hover', () => {
  if (!annotateEnabled) return
  hideDomInspectionOverlay()
})

ipcRenderer.on(
  'page-annotations-update',
  (_event, payload: { annotations?: Annotation[] } | undefined) => {
    setPageAnnotations(payload?.annotations ?? [])
    queueRenderCommentBadges()
  },
)

ipcRenderer.on('set-inspection-mode', (_event, payload: { enabled?: boolean } | undefined) => {
  selectionDebug('ipc:set-inspection-mode', { enabled: Boolean(payload?.enabled) })
  setDomInspectionEnabled(Boolean(payload?.enabled))
  applyInteractiveState()
  if (!isDomInspectionEnabled()) {
    ipcRenderer.send('inspect-node-hover', null)
  } else if (getDomInspectionLastTarget()) {
    emitHoveredElement(getDomInspectionLastTarget())
  }
})

ipcRenderer.on(
  'inspect-focus-node',
  (_event, payload: { nodeId?: string | null; pin?: boolean; fromPanel?: boolean } | undefined) => {
    handleInspectFocusNode(payload, getInspectableElementByNodeId)
  },
)

ipcRenderer.on('apply-linked-scroll', (_event, data: ScrollSyncData) => {
  applyIncomingLinkedScroll(data)
})

// --- MCP frame inspection handlers ---

ipcRenderer.on('take-dom-snapshot', (_event, payload: { requestId: string; maxDepth?: number; structured?: boolean }) => {
  const maxDepth = payload.maxDepth ?? 10

  function walkDom(element: Element, depth: number, indent: string): string {
    if (depth > maxDepth) return ''
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return ''
    const styles = window.getComputedStyle(element)
    if (styles.display === 'none' || styles.visibility === 'hidden') return ''

    const role = element.getAttribute('role') ?? undefined
    const tagName = element.tagName.toLowerCase()
    const text = compactText(element.textContent, 80)
    const path = buildElementPath(element, 4)
    const box = `[${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}]`

    let label = tagName
    if (role) label += ` role="${role}"`
    if (text) label += ` "${text}"`

    let result = `${indent}${label} ${box} path=${path}\n`

    for (const child of element.children) {
      result += walkDom(child, depth + 1, indent + '  ')
    }
    return result
  }

  const snapshot = payload.structured
    ? buildStructuredDomSnapshot(maxDepth)
    : walkDom(document.body, 0, '')
  ipcRenderer.send('take-dom-snapshot-response', { requestId: payload.requestId, data: snapshot })
})

ipcRenderer.on('query-dom-elements', (_event, payload: { requestId: string; selector: string; maxResults?: number }) => {
  const maxResults = payload.maxResults ?? 20
  let elements: Element[]
  try {
    elements = [...document.querySelectorAll(payload.selector)].slice(0, maxResults)
  } catch {
    ipcRenderer.send('query-dom-elements-response', {
      requestId: payload.requestId,
      data: { error: `Invalid selector: ${payload.selector}` },
    })
    return
  }
  const results = elements.map((el) => inspectionPayload(el))
  ipcRenderer.send('query-dom-elements-response', { requestId: payload.requestId, data: results })
})

ipcRenderer.on(
  'query-elements-in-rect',
  (_event, payload: { requestId: string; rect: { x: number; y: number; width: number; height: number }; maxResults?: number }) => {
    const maxResults = payload.maxResults ?? 15
    const region = payload.rect
    const regionRight = region.x + region.width
    const regionBottom = region.y + region.height
    const seen = new Set<Element>()
    const results: ReturnType<typeof inspectionPayload>[] = []

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const el = node as Element
        if (!isVisibleForSnapshot(el)) return NodeFilter.FILTER_REJECT
        const box = el.getBoundingClientRect()
        // Skip elements entirely outside the region
        if (box.right < region.x || box.left > regionRight || box.bottom < region.y || box.top > regionBottom) {
          return NodeFilter.FILTER_SKIP
        }
        if (isInteractiveForSnapshot(el)) return NodeFilter.FILTER_ACCEPT
        return NodeFilter.FILTER_SKIP
      },
    })

    let node: Node | null
    while ((node = walker.nextNode()) && results.length < maxResults) {
      const el = node as Element
      if (seen.has(el)) continue
      seen.add(el)
      results.push(inspectionPayload(el))
    }

    ipcRenderer.send('query-elements-in-rect-response', { requestId: payload.requestId, data: results })
  },
)

// --- IPC handlers for main-process queries (replacing executeJavaScript) ---

ipcRenderer.on('query-favicon', () => {
  const el =
    document.querySelector('link[rel~="icon"]') ||
    document.querySelector('link[rel="shortcut icon"]')
  const href = el instanceof HTMLLinkElement ? el.href : null
  ipcRenderer.send('query-favicon-result', href)
})

ipcRenderer.on(
  'query-active-element-rect',
  (_event, payload: { requestId: string }) => {
    const el = document.activeElement
    if (
      !(el instanceof HTMLElement) ||
      el === document.body ||
      el === document.documentElement
    ) {
      ipcRenderer.send('query-active-element-rect-result', {
        requestId: payload.requestId,
        data: null,
      })
      return
    }
    const rect = el.getBoundingClientRect()
    const labelText =
      el.getAttribute('aria-label') ||
      ('placeholder' in el ? el.getAttribute('placeholder') : null) ||
      ('name' in el ? el.getAttribute('name') : null) ||
      el.id ||
      (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        ? el.type
        : null)
    ipcRenderer.send('query-active-element-rect-result', {
      requestId: payload.requestId,
      data: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        name: labelText || null,
      },
    })
  },
)


let activeScrollToken = 0

ipcRenderer.on(
  'dispatch-scroll',
  (
    _event,
    payload: {
      requestId: string
      x: number
      y: number
      deltaX: number
      deltaY: number
    },
  ) => {
    const isScrollable = (el: Element): boolean => {
      const style = window.getComputedStyle(el)
      const overflowY = style.overflowY
      const overflowX = style.overflowX
      const canScrollY =
        /(auto|scroll|overlay)/.test(overflowY) &&
        el.scrollHeight > el.clientHeight
      const canScrollX =
        /(auto|scroll|overlay)/.test(overflowX) &&
        el.scrollWidth > el.clientWidth
      return canScrollY || canScrollX
    }
    let node: Element | null = document.elementFromPoint(payload.x, payload.y)
    while (node && !isScrollable(node)) node = node.parentElement
    const target =
      node || document.scrollingElement || document.documentElement
    if (!target) {
      ipcRenderer.send('dispatch-scroll-result', {
        requestId: payload.requestId,
        data: { ok: false, reason: 'no-scroll-target' },
      })
      return
    }
    const beforeLeft = target.scrollLeft
    const beforeTop = target.scrollTop

    const finish = () => {
      const afterLeft = target.scrollLeft
      const afterTop = target.scrollTop
      ipcRenderer.send('dispatch-scroll-result', {
        requestId: payload.requestId,
        data: {
          ok: true,
          consumed: beforeLeft !== afterLeft || beforeTop !== afterTop,
          targetTag:
            target instanceof Element
              ? target.tagName.toLowerCase()
              : 'document',
          beforeLeft,
          beforeTop,
          afterLeft,
          afterTop,
        },
      })
    }

    if (payload.deltaX === 0 && payload.deltaY === 0) {
      finish()
      return
    }

    // Supersede any in-flight ramp so back-to-back scrolls don't stack.
    const token = ++activeScrollToken
    const duration = PRESENCE_SCROLL_ANIMATION_MS
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
    let startedAt = 0
    let appliedX = 0
    let appliedY = 0

    const tick = (now: number) => {
      if (token !== activeScrollToken) {
        finish()
        return
      }
      if (startedAt === 0) startedAt = now
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = easeOutCubic(progress)
      const targetX = payload.deltaX * eased
      const targetY = payload.deltaY * eased
      const stepX = targetX - appliedX
      const stepY = targetY - appliedY
      if (stepX !== 0 || stepY !== 0) target.scrollBy(stepX, stepY)
      appliedX = targetX
      appliedY = targetY
      if (progress < 1) {
        requestAnimationFrame(tick)
      } else {
        finish()
      }
    }
    requestAnimationFrame(tick)
  },
)

// --- Global event listeners ---

window.addEventListener(
  'scroll',
  () => {
    queueScrollSyncBroadcast(interactive)
    queueRenderCommentBadges()
    queueRefreshDomInspectionOverlay()
  },
  { passive: true, capture: true }
)

window.addEventListener('resize', () => {
  queueRenderCommentBadges()
  queueRefreshDomInspectionOverlay()
})

window.addEventListener(
  'pointerdown',
  () => {
    if (!isCommentHoverActive()) return
    hideCommentBadgeHover()
  },
  { capture: true },
)

window.addEventListener(
  'wheel',
  () => {
    queueRenderCommentBadges()
  },
  { passive: true, capture: true },
)

window.addEventListener('blur', () => {
  hideCommentBadgeHover()
})

// --- Frame hover state ---
window.addEventListener('mouseenter', () => {
  ipcRenderer.send('frame-hover', true)
})
window.addEventListener('mouseleave', () => {
  ipcRenderer.send('frame-hover', false)
})

// --- Resize handle ---

function injectResizeHandle(): void {
  if (document.getElementById('__canvas-resize-handle')) return

  const handle = document.createElement('div')
  handle.id = '__canvas-resize-handle'
  Object.assign(handle.style, {
    position: 'fixed',
    bottom: '0',
    right: '0',
    width: '16px',
    height: '16px',
    cursor: 'nwse-resize',
    zIndex: '2147483647',
    background: 'transparent',
    pointerEvents: 'auto',
  })

  let dragState:
    | {
        pointerId: number
        screenX: number
        screenY: number
      }
    | null = null

  handle.addEventListener('pointerdown', (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    dragState = {
      pointerId: event.pointerId,
      screenX: event.screenX,
      screenY: event.screenY,
    }
    handle.setPointerCapture(event.pointerId)
    ipcRenderer.send('peek-resize-start')
  })

  const endResizeDrag = (pointerId?: number) => {
    if (!dragState) return
    if (pointerId !== undefined && dragState.pointerId !== pointerId) return
    if (handle.hasPointerCapture(dragState.pointerId)) {
      handle.releasePointerCapture(dragState.pointerId)
    }
    dragState = null
    ipcRenderer.send('peek-resize-end')
  }

  handle.addEventListener('pointermove', (event: PointerEvent) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return
    const dx = event.screenX - dragState.screenX
    const dy = event.screenY - dragState.screenY
    dragState = {
      pointerId: event.pointerId,
      screenX: event.screenX,
      screenY: event.screenY,
    }
    ipcRenderer.send('peek-resize-move', { dx, dy })
  })

  handle.addEventListener('pointerup', (event: PointerEvent) => {
    endResizeDrag(event.pointerId)
  })

  handle.addEventListener('pointercancel', (event: PointerEvent) => {
    endResizeDrag(event.pointerId)
  })

  handle.addEventListener('lostpointercapture', () => {
    endResizeDrag()
  })

  document.body.appendChild(handle)
}

// Inject elements on every navigation
function onDomReady(): void {
  injectResizeHandle()
  applyInteractiveState()
  applyDomInspectionState()
  applyAnnotateState()
  seedScrollSyncBaseline()
  initComponentInspector()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onDomReady)
} else {
  onDomReady()
}
