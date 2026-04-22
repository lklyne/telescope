import { describe, expect, it } from 'vitest'
import {
  isAdditiveSelection,
  modifiersFromEvent,
  selectionMutationMode,
} from '../../src/shared/selection-modifiers'

describe('selection-modifiers', () => {
  describe('modifiersFromEvent', () => {
    it('reads shift/meta/ctrl flags from a MouseEvent-like object', () => {
      expect(modifiersFromEvent({ shiftKey: true, metaKey: false, ctrlKey: false })).toEqual({
        shift: true,
        meta: false,
        ctrl: false,
      })
      expect(modifiersFromEvent({ shiftKey: false, metaKey: true, ctrlKey: false })).toEqual({
        shift: false,
        meta: true,
        ctrl: false,
      })
    })

    it('coerces undefined flags to false', () => {
      expect(modifiersFromEvent({})).toEqual({ shift: false, meta: false, ctrl: false })
    })
  })

  describe('isAdditiveSelection', () => {
    it('returns false for null, undefined, or all-off modifiers', () => {
      expect(isAdditiveSelection(null)).toBe(false)
      expect(isAdditiveSelection(undefined)).toBe(false)
      expect(isAdditiveSelection({ shift: false, meta: false, ctrl: false })).toBe(false)
    })

    it('returns true when any of shift/meta/ctrl is held', () => {
      expect(isAdditiveSelection({ shift: true, meta: false, ctrl: false })).toBe(true)
      expect(isAdditiveSelection({ shift: false, meta: true, ctrl: false })).toBe(true)
      expect(isAdditiveSelection({ shift: false, meta: false, ctrl: true })).toBe(true)
    })
  })

  describe('selectionMutationMode', () => {
    it('maps no modifier to replace', () => {
      expect(selectionMutationMode(null)).toBe('replace')
      expect(selectionMutationMode({ shift: false, meta: false, ctrl: false })).toBe('replace')
    })

    it('maps additive modifier to toggle', () => {
      expect(selectionMutationMode({ shift: true, meta: false, ctrl: false })).toBe('toggle')
      expect(selectionMutationMode({ shift: false, meta: true, ctrl: false })).toBe('toggle')
      expect(selectionMutationMode({ shift: false, meta: false, ctrl: true })).toBe('toggle')
    })
  })
})
