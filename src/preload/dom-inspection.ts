import { ipcRenderer } from 'electron'
import {
  deepElementFromPoint,
  inspectionPayload,
} from './dom-element-utils'
import { isPageOverlayTarget } from './gesture-forwarding'

let domInspectionEnabled = false
let domInspectionHoverKey = ''
let domInspectionHighlightEl: HTMLDivElement | null = null
let domInspectionPinnedHighlightEl: HTMLDivElement | null = null
let domInspectionLabelEl: HTMLDivElement | null = null
let domInspectionLastTarget: Element | null = null
let domInspectionPinnedTarget: Element | null = null

export function isDomInspectionEnabled(): boolean {
  return domInspectionEnabled
}

export function getDomInspectionLastTarget(): Element | null {
  return domInspectionLastTarget
}

export function ensureDomInspectionOverlay(): void {
  if (domInspectionHighlightEl && domInspectionPinnedHighlightEl && domInspectionLabelEl) return

  const createHighlight = (id: string, backgroundAlpha: number, borderAlpha: number) => {
    const highlight = document.createElement('div')
    highlight.id = id
    Object.assign(highlight.style, {
      position: 'fixed',
      zIndex: '2147483645',
      pointerEvents: 'none',
      border: `1px solid rgba(59, 130, 246, ${borderAlpha})`,
      borderStyle: 'dashed',
      background: `rgba(59, 130, 246, ${backgroundAlpha})`,
      boxShadow: '0 0 0 1px rgba(255,255,255,0.22) inset',
      display: 'none',
    })
    return highlight
  }

  const pinnedHighlight = createHighlight(
    '__canvas-dom-inspection-pinned-highlight',
    0.14,
    0.95,
  )
  const highlight = createHighlight('__canvas-dom-inspection-highlight', 0.14, 0.95)
  Object.assign(highlight.style, {
    position: 'fixed',
    zIndex: '2147483646',
  })

  const label = document.createElement('div')
  label.id = '__canvas-dom-inspection-label'
  Object.assign(label.style, {
    position: 'fixed',
    zIndex: '2147483647',
    pointerEvents: 'none',
    maxWidth: '320px',
    padding: '3px 4px',
    borderRadius: '6px',
    background: 'rgba(59, 130, 246, 0.95)',
    color: '#ffffff',
    font: '11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'none',
  })

  document.documentElement.appendChild(pinnedHighlight)
  document.documentElement.appendChild(highlight)
  document.documentElement.appendChild(label)
  domInspectionPinnedHighlightEl = pinnedHighlight
  domInspectionHighlightEl = highlight
  domInspectionLabelEl = label
}

export function hideDomInspectionOverlay(): void {
  if (domInspectionHighlightEl) domInspectionHighlightEl.style.display = 'none'
  if (domInspectionPinnedHighlightEl) domInspectionPinnedHighlightEl.style.display = 'none'
  if (domInspectionLabelEl) domInspectionLabelEl.style.display = 'none'
}

export function updateDomInspectionOverlay(
  element: Element,
  payload: ReturnType<typeof inspectionPayload>,
  options?: { pinnedElement?: Element | null; pinnedPayload?: ReturnType<typeof inspectionPayload> | null },
): void {
  ensureDomInspectionOverlay()
  if (!domInspectionHighlightEl || !domInspectionPinnedHighlightEl || !domInspectionLabelEl) return

  const setHighlightRect = (highlight: HTMLDivElement, target: Element | null) => {
    if (!target) {
      highlight.style.display = 'none'
      return null
    }
    const rect = target.getBoundingClientRect()
    highlight.style.display = 'block'
    highlight.style.left = `${Math.round(rect.left)}px`
    highlight.style.top = `${Math.round(rect.top)}px`
    highlight.style.width = `${Math.max(0, Math.round(rect.width))}px`
    highlight.style.height = `${Math.max(0, Math.round(rect.height))}px`
    return rect
  }

  const pinnedElement = options?.pinnedElement ?? null
  const pinnedPayload = options?.pinnedPayload ?? null
  const sameAsPinned = pinnedPayload?.nodeId === payload.nodeId

  if (pinnedElement && pinnedPayload && !sameAsPinned) {
    setHighlightRect(domInspectionPinnedHighlightEl, pinnedElement)
    domInspectionHighlightEl.style.border = '1px solid rgba(59, 130, 246, 0.48)'
    domInspectionHighlightEl.style.background = 'rgba(59, 130, 246, 0.07)'
  } else {
    domInspectionPinnedHighlightEl.style.display = 'none'
    domInspectionHighlightEl.style.border = '1px solid rgba(59, 130, 246, 0.95)'
    domInspectionHighlightEl.style.background = 'rgba(59, 130, 246, 0.14)'
  }

  const rect = setHighlightRect(domInspectionHighlightEl, element)
  if (!rect) return

  domInspectionLabelEl.style.display = 'block'
  const labelText = payload.name.trim()
  const labelMatch = /^([a-zA-Z][\w:-]*)(.*)$/.exec(labelText)
  if (labelMatch) {
    const [, elementType, remainder] = labelMatch
    domInspectionLabelEl.replaceChildren()

    const elementTypeChip = document.createElement('span')
    Object.assign(elementTypeChip.style, {
      display: 'inline-block',
      padding: '1px 4px',
      marginRight: '6px',
      borderRadius: '4px',
      background: 'color-mix(in srgb, #000000 30%, transparent)',
    })
    elementTypeChip.textContent = elementType
    domInspectionLabelEl.appendChild(elementTypeChip)
    domInspectionLabelEl.appendChild(document.createTextNode(remainder))
  } else {
    domInspectionLabelEl.textContent = payload.name
  }
  const outerPadding = 2
  const labelRect = domInspectionLabelEl.getBoundingClientRect()
  const maxLeft = Math.max(outerPadding, window.innerWidth - Math.ceil(labelRect.width) - outerPadding)
  const left = Math.min(maxLeft, Math.max(outerPadding, Math.round(rect.left)))

  // Keep existing "prefer above target" behavior, but adaptively place below when space is tight.
  const aboveTop = Math.round(rect.top) - Math.ceil(labelRect.height) - outerPadding
  const belowTop = Math.round(rect.bottom) + outerPadding
  const maxTop = Math.max(outerPadding, window.innerHeight - Math.ceil(labelRect.height) - outerPadding)
  const top = aboveTop >= outerPadding ? aboveTop : Math.min(maxTop, belowTop)

  domInspectionLabelEl.style.left = `${left}px`
  domInspectionLabelEl.style.top = `${top}px`
}

export function emitHoveredElement(target: Element | null): void {
  if (!domInspectionEnabled) return
  if (!target) {
    domInspectionHoverKey = ''
    ipcRenderer.send('inspect-node-hover', null)
    if (domInspectionPinnedTarget) {
      const payload = inspectionPayload(domInspectionPinnedTarget)
      domInspectionLastTarget = domInspectionPinnedTarget
      updateDomInspectionOverlay(domInspectionPinnedTarget, payload)
      return
    }
    domInspectionLastTarget = null
    hideDomInspectionOverlay()
    return
  }

  const payload = inspectionPayload(target)
  const nextKey = `${payload.id}:${payload.elementPath}`
  if (nextKey === domInspectionHoverKey) {
    updateDomInspectionOverlay(target, payload, {
      pinnedElement: domInspectionPinnedTarget,
      pinnedPayload: domInspectionPinnedTarget ? inspectionPayload(domInspectionPinnedTarget) : null,
    })
    return
  }

  domInspectionHoverKey = nextKey
  domInspectionLastTarget = target
  updateDomInspectionOverlay(target, payload, {
    pinnedElement: domInspectionPinnedTarget,
    pinnedPayload: domInspectionPinnedTarget ? inspectionPayload(domInspectionPinnedTarget) : null,
  })
  ipcRenderer.send('inspect-node-hover', payload)
  ipcRenderer.send('inspect-node-detail-update', payload)
}

function handleDomInspectionMove(event: MouseEvent): void {
  if (!domInspectionEnabled) return
  const target = deepElementFromPoint(event.clientX, event.clientY)
  if (isPageOverlayTarget(target)) {
    emitHoveredElement(null)
    return
  }
  emitHoveredElement(target)
}

function handleDomInspectionClick(event: MouseEvent): void {
  if (!domInspectionEnabled) return
  const target = deepElementFromPoint(event.clientX, event.clientY)
  if (!target) return
  if (isPageOverlayTarget(target)) return
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
  const payload = inspectionPayload(target)
  domInspectionPinnedTarget = target
  updateDomInspectionOverlay(target, payload)
  ipcRenderer.send('inspect-node-select', payload)
  ipcRenderer.send('inspect-node-detail-update', payload)
}

function handleDomInspectionMouseDown(event: MouseEvent): void {
  if (!domInspectionEnabled) return
  const target = deepElementFromPoint(event.clientX, event.clientY)
  if (isPageOverlayTarget(target)) return
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

function handleDomInspectionLeave(): void {
  if (!domInspectionEnabled) return
  emitHoveredElement(null)
}

function handleDomInspectionMouseOut(event: MouseEvent): void {
  if (!domInspectionEnabled) return
  // Some WebContents transitions do not reliably fire `mouseleave` on window.
  // Treat mouseout to nowhere as a leave so hover state is cleared.
  if (event.relatedTarget === null) {
    emitHoveredElement(null)
  }
}

function handleDomInspectionBlur(): void {
  if (!domInspectionEnabled) return
  emitHoveredElement(null)
}

export function setDomInspectionEnabled(enabled: boolean): void {
  domInspectionEnabled = enabled
  applyDomInspectionState()
}

export function applyDomInspectionState(): void {
  window.removeEventListener('mousemove', handleDomInspectionMove, true)
  window.removeEventListener('mousedown', handleDomInspectionMouseDown, true)
  window.removeEventListener('click', handleDomInspectionClick, true)
  window.removeEventListener('mouseleave', handleDomInspectionLeave, true)
  window.removeEventListener('mouseout', handleDomInspectionMouseOut, true)
  window.removeEventListener('blur', handleDomInspectionBlur, true)
  if (domInspectionEnabled) {
    ensureDomInspectionOverlay()
    window.addEventListener('mousemove', handleDomInspectionMove, true)
    window.addEventListener('mousedown', handleDomInspectionMouseDown, true)
    window.addEventListener('click', handleDomInspectionClick, true)
    window.addEventListener('mouseleave', handleDomInspectionLeave, true)
    window.addEventListener('mouseout', handleDomInspectionMouseOut, true)
    window.addEventListener('blur', handleDomInspectionBlur, true)
  } else {
    window.removeEventListener('mousemove', handleDomInspectionMove, true)
    window.removeEventListener('click', handleDomInspectionClick, true)
    window.removeEventListener('mouseleave', handleDomInspectionLeave, true)
    window.removeEventListener('mouseout', handleDomInspectionMouseOut, true)
    window.removeEventListener('blur', handleDomInspectionBlur, true)
    domInspectionHoverKey = ''
    domInspectionLastTarget = null
    domInspectionPinnedTarget = null
    hideDomInspectionOverlay()
  }
}

export function queueRefreshDomInspectionOverlay(): void {
  if (!domInspectionEnabled) return
  const target = domInspectionLastTarget
  if (!target) return
  window.requestAnimationFrame(() => {
    if (!domInspectionEnabled || domInspectionLastTarget !== target) return
    const payload = inspectionPayload(target)
    updateDomInspectionOverlay(target, payload, {
      pinnedElement: domInspectionPinnedTarget,
      pinnedPayload: domInspectionPinnedTarget ? inspectionPayload(domInspectionPinnedTarget) : null,
    })
  })
}

export function handleInspectFocusNode(
  payload: { nodeId?: string | null; pin?: boolean; fromPanel?: boolean } | undefined,
  getInspectableElementByNodeId: (nodeId: string | null) => Element | null,
): void {
  const target = getInspectableElementByNodeId(payload?.nodeId ?? null)
  if (!target) {
    if (payload?.pin) {
      domInspectionPinnedTarget = null
      domInspectionLastTarget = null
      hideDomInspectionOverlay()
    } else {
      emitHoveredElement(null)
    }
    return
  }
  // When driven from the panel, scroll to the element if it's off-screen
  if (payload?.fromPanel && payload?.pin) {
    const rect = target.getBoundingClientRect()
    const isOffScreen =
      rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth
    if (isOffScreen) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  const detail = inspectionPayload(target)
  updateDomInspectionOverlay(target, detail, {
    pinnedElement: payload?.pin ? target : domInspectionPinnedTarget,
    pinnedPayload:
      payload?.pin || !domInspectionPinnedTarget ? detail : inspectionPayload(domInspectionPinnedTarget),
  })
  domInspectionLastTarget = target
  if (payload?.pin) {
    domInspectionPinnedTarget = target
    // When driven from the panel, main already knows about the selection.
    // Sending inspect-node-select back would trigger a circular
    // selectPageById -> syncInspectionState that can hide the overlay.
    if (!payload.fromPanel) {
      ipcRenderer.send('inspect-node-select', detail)
    }
    ipcRenderer.send('inspect-node-detail-update', detail)
  } else {
    ipcRenderer.send('inspect-node-hover', detail)
    ipcRenderer.send('inspect-node-detail-update', detail)
  }
}
