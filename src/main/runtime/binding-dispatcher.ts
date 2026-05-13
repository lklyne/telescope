import type { WebContents } from 'electron'
import {
  BINDINGS,
  dispatchKey,
  normalizeElectronInput,
  type BindingContext,
  type KeyboardSourceView,
} from '../../shared/bindings'
import { setSpaceModifierHeld } from './runtime-context'
import { activeTool } from './tool-mode'
import { workspaceViewMode } from '../ui-state'
import { aboveView } from './view-refs'
import { mainHandlers } from './binding-handlers'

// Track text-editing state per webContents so renderers don't clobber each
// other's flag. Any one source being active is enough to suppress shortcuts.
const textEditingByWebContents = new WeakMap<WebContents, boolean>()
let textEditingActiveCount = 0

// Annotation state surfaced from above-view's renderer-local React state so
// Escape resolution (annotation-close-thread / annotation-clear-draft) works.
let hasOpenAnnotationThread = false
let hasPendingAnnotation = false

export function setAnnotationState(openThread: boolean, pendingAnnotation: boolean): void {
  hasOpenAnnotationThread = openThread
  hasPendingAnnotation = pendingAnnotation
}

export function setTextEditingActive(webContents: WebContents, active: boolean): void {
  const prev = textEditingByWebContents.get(webContents) ?? false
  if (prev === active) return
  textEditingByWebContents.set(webContents, active)
  textEditingActiveCount += active ? 1 : -1
  if (textEditingActiveCount < 0) textEditingActiveCount = 0
}

export function isTextEditingActive(): boolean {
  return textEditingActiveCount > 0
}

export function buildBindingContext(
  sourceView: KeyboardSourceView,
  pageFocusActive: boolean,
): BindingContext {
  return {
    activeTool: activeTool(),
    isTextEditing: isTextEditingActive(),
    pageFocusActive,
    sourceView,
    viewMode: workspaceViewMode(),
    hasOpenAnnotationThread,
    hasPendingAnnotation,
  }
}

const attachedWebContents = new WeakSet<WebContents>()

export function attachBindingDispatcher(
  webContents: WebContents,
  sourceView: KeyboardSourceView,
): void {
  if (attachedWebContents.has(webContents)) return
  attachedWebContents.add(webContents)

  webContents.on('destroyed', () => {
    if (textEditingByWebContents.get(webContents)) {
      textEditingActiveCount = Math.max(0, textEditingActiveCount - 1)
    }
    textEditingByWebContents.delete(webContents)
  })

  webContents.on('before-input-event', (event, input) => {
    // Track Space modifier regardless of editing state — space-to-pan must
    // stay in sync even when focus is in an input that consumes Space natively.
    if (input.key === ' ' || input.code === 'Space') {
      setSpaceModifierHeld(input.type === 'keyDown')
    }

    const normalizedKey = normalizeElectronInput(input)
    if (!normalizedKey) return

    const pageFocusActive = sourceView === 'page'
    const ctx = buildBindingContext(sourceView, pageFocusActive)

    const bindingId = dispatchKey(BINDINGS, normalizedKey, ctx)
    if (!bindingId) return

    const binding = BINDINGS.find((b) => b.id === bindingId && b.defaultKey.key === normalizedKey.key)
    if (!binding) return

    event.preventDefault()

    if (binding.target === 'main') {
      const handler = (mainHandlers as Record<string, ((ctx: BindingContext) => void) | undefined>)[bindingId]
      if (handler) handler(ctx)
    } else {
      // Renderer-targeted binding — forward via IPC
      const targetWc = resolveTargetWebContents(binding.target)
      if (targetWc && !targetWc.isDestroyed()) {
        targetWc.send('binding-fire', bindingId)
      }
    }
  })
}

function resolveTargetWebContents(target: string): WebContents | null {
  if (target === 'aboveView') return aboveView?.webContents ?? null
  return null
}
