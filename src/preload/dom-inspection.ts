import { ipcRenderer } from 'electron'
import {
  deepElementFromPoint,
  elementSelectorParts,
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

// Chrome-style box model overlay: 4 strips for margin (orange, hashed),
// 4 strips for padding (green, solid). Rendered as fixed-position divs.
type Side = 'top' | 'right' | 'bottom' | 'left'
type StripKind = 'margin' | 'padding'
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'] as const
const STRIP_KINDS: readonly StripKind[] = ['margin', 'padding'] as const
let domInspectionStripEls: Record<StripKind, Record<Side, HTMLDivElement>> | null = null

const MARGIN_COLOR = 'rgba(246, 178, 107, 0.55)'
const PADDING_COLOR = 'rgba(147, 196, 125, 0.55)'
const MARGIN_HASH = `repeating-linear-gradient(45deg, ${MARGIN_COLOR} 0 4px, rgba(246, 178, 107, 0.25) 4px 8px)`

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
    maxWidth: '360px',
    padding: '5px 6px',
    borderRadius: '6px',
    background: 'rgba(30, 41, 59, 0.96)',
    color: '#ffffff',
    font: '11px/1.25 ui-monospace, SFMono-Regular, Menlo, monospace',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    display: 'none',
  })

  const makeStrip = (kind: StripKind, side: Side) => {
    const strip = document.createElement('div')
    strip.id = `__canvas-dom-inspection-${kind}-${side}`
    Object.assign(strip.style, {
      position: 'fixed',
      zIndex: '2147483644',
      pointerEvents: 'none',
      display: 'none',
      background: kind === 'margin' ? MARGIN_HASH : PADDING_COLOR,
    })
    return strip
  }

  const strips = {} as Record<StripKind, Record<Side, HTMLDivElement>>
  for (const kind of STRIP_KINDS) {
    const sideMap = {} as Record<Side, HTMLDivElement>
    for (const side of SIDES) {
      sideMap[side] = makeStrip(kind, side)
      document.documentElement.appendChild(sideMap[side])
    }
    strips[kind] = sideMap
  }

  document.documentElement.appendChild(pinnedHighlight)
  document.documentElement.appendChild(highlight)
  document.documentElement.appendChild(label)
  domInspectionPinnedHighlightEl = pinnedHighlight
  domInspectionHighlightEl = highlight
  domInspectionLabelEl = label
  domInspectionStripEls = strips
}

function hideBoxModelOverlay(): void {
  if (!domInspectionStripEls) return
  for (const kind of STRIP_KINDS) {
    for (const side of SIDES) domInspectionStripEls[kind][side].style.display = 'none'
  }
}

function setStripRect(
  strip: HTMLDivElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (width <= 0 || height <= 0) {
    strip.style.display = 'none'
    return
  }
  strip.style.display = 'block'
  strip.style.left = `${Math.round(x)}px`
  strip.style.top = `${Math.round(y)}px`
  strip.style.width = `${Math.round(width)}px`
  strip.style.height = `${Math.round(height)}px`
}

function parsePx(value: string): number {
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

function updateBoxModelOverlay(rect: DOMRect, styles: CSSStyleDeclaration): void {
  if (!domInspectionStripEls) return
  const mt = parsePx(styles.marginTop)
  const mr = parsePx(styles.marginRight)
  const mb = parsePx(styles.marginBottom)
  const ml = parsePx(styles.marginLeft)
  const pt = parsePx(styles.paddingTop)
  const pr = parsePx(styles.paddingRight)
  const pb = parsePx(styles.paddingBottom)
  const pl = parsePx(styles.paddingLeft)
  const bt = parsePx(styles.borderTopWidth)
  const br = parsePx(styles.borderRightWidth)
  const bb = parsePx(styles.borderBottomWidth)
  const bl = parsePx(styles.borderLeftWidth)

  const margins = domInspectionStripEls.margin
  const paddings = domInspectionStripEls.padding

  // Margin strips lie OUTSIDE the border-box. Top/bottom span full width
  // (covering margin corners); left/right fit between them.
  setStripRect(margins.top, rect.left - ml, rect.top - mt, rect.width + ml + mr, mt)
  setStripRect(margins.bottom, rect.left - ml, rect.bottom, rect.width + ml + mr, mb)
  setStripRect(margins.left, rect.left - ml, rect.top, ml, rect.height)
  setStripRect(margins.right, rect.right, rect.top, mr, rect.height)

  // Padding strips lie INSIDE the border-box, between border and content.
  const padBoxX = rect.left + bl
  const padBoxY = rect.top + bt
  const padBoxW = Math.max(0, rect.width - bl - br)
  const padBoxH = Math.max(0, rect.height - bt - bb)
  setStripRect(paddings.top, padBoxX, padBoxY, padBoxW, pt)
  setStripRect(paddings.bottom, padBoxX, padBoxY + padBoxH - pb, padBoxW, pb)
  setStripRect(paddings.left, padBoxX, padBoxY + pt, pl, Math.max(0, padBoxH - pt - pb))
  setStripRect(paddings.right, padBoxX + padBoxW - pr, padBoxY + pt, pr, Math.max(0, padBoxH - pt - pb))
}

function shortFontFamily(fontFamily: string): string {
  // Computed font-family is a comma-separated stack; the first family is the
  // resolved primary. Strip surrounding quotes for display.
  const first = fontFamily.split(',')[0]?.trim() ?? ''
  return first.replace(/^['"]|['"]$/g, '')
}

function buildLabelContent(label: HTMLDivElement, element: Element, styles: CSSStyleDeclaration): void {
  label.replaceChildren()

  const headerRow = document.createElement('div')
  Object.assign(headerRow.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: '0',
  })

  const { tag, remainder } = elementSelectorParts(element)

  const chip = document.createElement('span')
  Object.assign(chip.style, {
    padding: '1px 5px',
    borderRadius: '4px',
    background: 'rgba(59, 130, 246, 0.95)',
    color: '#fff',
    flexShrink: '0',
  })
  chip.textContent = tag
  headerRow.appendChild(chip)

  if (remainder) {
    const name = document.createElement('span')
    Object.assign(name.style, {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      minWidth: '0',
      opacity: '0.9',
    })
    name.textContent = remainder
    headerRow.appendChild(name)
  }

  label.appendChild(headerRow)

  const fontFamily = shortFontFamily(styles.fontFamily)
  if (fontFamily) {
    const fontRow = document.createElement('div')
    Object.assign(fontRow.style, {
      display: 'flex',
      alignItems: 'baseline',
      gap: '6px',
      marginTop: '6px',
      whiteSpace: 'nowrap',
      minWidth: '0',
    })

    const familyName = document.createElement('span')
    Object.assign(familyName.style, {
      fontFamily: styles.fontFamily,
      fontWeight: styles.fontWeight,
      fontStyle: styles.fontStyle,
      color: '#fff',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      minWidth: '0',
    })
    familyName.textContent = fontFamily
    fontRow.appendChild(familyName)

    const metaParts = [styles.fontSize, styles.fontWeight]
    if (styles.letterSpacing && styles.letterSpacing !== 'normal') {
      metaParts.push(styles.letterSpacing)
    }
    const metaRest = document.createElement('span')
    Object.assign(metaRest.style, {
      opacity: '0.7',
      flexShrink: '0',
    })
    metaRest.textContent = `· ${metaParts.join(' · ')}`
    fontRow.appendChild(metaRest)

    label.appendChild(fontRow)
  }

  const colorRow = document.createElement('div')
  Object.assign(colorRow.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '6px',
  })

  const addSwatch = (name: string, color: string) => {
    const item = document.createElement('span')
    Object.assign(item.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      opacity: '0.85',
    })
    const sw = document.createElement('span')
    Object.assign(sw.style, {
      display: 'inline-block',
      width: '10px',
      height: '10px',
      borderRadius: '2px',
      background: color,
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.35)',
      flexShrink: '0',
    })
    const text = document.createElement('span')
    text.textContent = `${name} ${color}`
    item.appendChild(sw)
    item.appendChild(text)
    colorRow.appendChild(item)
  }
  addSwatch('text', styles.color)
  if (styles.backgroundColor && styles.backgroundColor !== 'rgba(0, 0, 0, 0)') {
    addSwatch('bg', styles.backgroundColor)
  }
  label.appendChild(colorRow)
}

export function hideDomInspectionOverlay(): void {
  if (domInspectionHighlightEl) domInspectionHighlightEl.style.display = 'none'
  if (domInspectionPinnedHighlightEl) domInspectionPinnedHighlightEl.style.display = 'none'
  if (domInspectionLabelEl) domInspectionLabelEl.style.display = 'none'
  hideBoxModelOverlay()
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

  const styles = window.getComputedStyle(element)
  updateBoxModelOverlay(rect, styles)

  domInspectionLabelEl.style.display = 'block'
  buildLabelContent(domInspectionLabelEl, element, styles)
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
