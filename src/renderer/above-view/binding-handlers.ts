import type { BindingId } from '../../shared/bindings'

export function buildAboveViewHandlers(
  closeThread: () => void,
  clearDraft: () => void,
): Partial<Record<BindingId, () => void>> {
  return {
    'annotation-close-thread': closeThread,
    'annotation-clear-draft': clearDraft,
  }
}
