import type { SelectionModifiers } from './types'

export type SelectionMutationMode = 'replace' | 'add' | 'remove' | 'toggle'

export function modifiersFromEvent(event: {
  shiftKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
}): SelectionModifiers {
  return {
    shift: Boolean(event.shiftKey),
    meta: Boolean(event.metaKey),
    ctrl: Boolean(event.ctrlKey),
  }
}

export function isAdditiveSelection(modifiers: SelectionModifiers | null | undefined): boolean {
  if (!modifiers) return false
  return modifiers.shift || modifiers.meta || modifiers.ctrl
}

export function selectionMutationMode(
  modifiers: SelectionModifiers | null | undefined,
): SelectionMutationMode {
  return isAdditiveSelection(modifiers) ? 'toggle' : 'replace'
}
