import type { BindingId } from '../../shared/bindings'

export type AboveViewBindingId = Extract<
  BindingId,
  'annotation-close-thread' | 'annotation-clear-draft'
>

export function buildAboveViewHandlers(
  closeThread: () => void,
  clearDraft: () => void,
): Partial<Record<BindingId, () => void>> {
  return {
    'annotation-close-thread': closeThread,
    'annotation-clear-draft': clearDraft,
  }
}
