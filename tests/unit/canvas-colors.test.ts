import { describe, expect, it } from 'vitest'
import {
  CANVAS_COLOR_SLOTS,
  COLOR_PRESETS,
  NEUTRAL_STORAGE,
  resolveCanvasColor,
  slotForStorage,
} from '../../src/shared/canvas-colors'

describe('canvas-colors palette', () => {
  it('exposes the eight ADR-0013 slots in canonical order', () => {
    expect(CANVAS_COLOR_SLOTS.map((s) => s.id)).toEqual([
      'neutral',
      'purple',
      'blue',
      'cyan',
      'green',
      'yellow',
      'orange',
      'red',
    ])
  })

  it('only the neutral slot is theme/role-resolved (others have a fixed hex)', () => {
    const neutral = CANVAS_COLOR_SLOTS.find((s) => s.id === 'neutral')!
    expect(neutral.hex).toBeNull()
    for (const slot of CANVAS_COLOR_SLOTS.filter((s) => s.id !== 'neutral')) {
      expect(slot.hex).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(slot.storage).toBe(slot.hex)
    }
  })
})

describe('resolveCanvasColor', () => {
  it('resolves neutral to a contrasting fill in light vs dark mode', () => {
    const lightFill = resolveCanvasColor(NEUTRAL_STORAGE, { role: 'fill', isDark: false })
    const darkFill = resolveCanvasColor(NEUTRAL_STORAGE, { role: 'fill', isDark: true })
    expect(lightFill).not.toBe(darkFill)
  })

  it('resolves neutral ink to the opposite tone of neutral fill in the same theme', () => {
    const lightInk = resolveCanvasColor(NEUTRAL_STORAGE, { role: 'ink', isDark: false })
    const lightFill = resolveCanvasColor(NEUTRAL_STORAGE, { role: 'fill', isDark: false })
    const darkInk = resolveCanvasColor(NEUTRAL_STORAGE, { role: 'ink', isDark: true })
    const darkFill = resolveCanvasColor(NEUTRAL_STORAGE, { role: 'fill', isDark: true })
    expect(lightInk).not.toBe(lightFill)
    expect(darkInk).not.toBe(darkFill)
  })

  it('passes hex strings through unchanged', () => {
    expect(resolveCanvasColor('#abcdef')).toBe('#abcdef')
  })

  it('legacy "1"–"6" presets keep resolving to their original hexes', () => {
    // Acceptance: legacy canvases with `color: "1"` still render red.
    expect(resolveCanvasColor('1')).toBe(COLOR_PRESETS['1'])
    expect(resolveCanvasColor('1')).toBe('#e8b4b8')
    expect(resolveCanvasColor('6')).toBe(COLOR_PRESETS['6'])
  })
})

describe('slotForStorage', () => {
  it('matches the neutral sentinel', () => {
    expect(slotForStorage(NEUTRAL_STORAGE)).toBe('neutral')
  })

  it('matches a hex against the slot whose hex equals it (case-insensitive)', () => {
    expect(slotForStorage('#c8b8d8')).toBe('purple')
    expect(slotForStorage('#FFE18E')).toBe('yellow')
    expect(slotForStorage('#ffe18e')).toBe('yellow')
  })

  it('maps legacy presets to their corresponding slot', () => {
    expect(slotForStorage('1')).toBe('red')
    expect(slotForStorage('3')).toBe('yellow')
    expect(slotForStorage('6')).toBe('purple')
  })

  it('returns null for unknown / null / empty inputs', () => {
    expect(slotForStorage(null)).toBeNull()
    expect(slotForStorage(undefined)).toBeNull()
    expect(slotForStorage('')).toBeNull()
    expect(slotForStorage('#000000')).toBeNull()
  })
})
