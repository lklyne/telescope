import { describe, expect, it } from 'vitest'
import {
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  clampTextSize,
  lineHeightForTextSize,
  presetLabelForValue,
} from '../../src/renderer/above-view/TextSizeDropdown'

describe('TextSizeDropdown helpers', () => {
  it('labels every preset value with its preset name', () => {
    expect(presetLabelForValue(14)).toBe('Small')
    expect(presetLabelForValue(32)).toBe('Medium')
    expect(presetLabelForValue(56)).toBe('Large')
    expect(presetLabelForValue(96)).toBe('Extra large')
    expect(presetLabelForValue(144)).toBe('Huge')
  })

  it('labels non-preset values as Custom', () => {
    expect(presetLabelForValue(24)).toBe('Custom')
    expect(presetLabelForValue(200)).toBe('Custom')
  })

  it('clamps raw input within the 8–256 range', () => {
    expect(clampTextSize(0)).toBe(TEXT_SIZE_MIN)
    expect(clampTextSize(7)).toBe(TEXT_SIZE_MIN)
    expect(clampTextSize(300)).toBe(TEXT_SIZE_MAX)
    expect(clampTextSize(48)).toBe(48)
  })

  it('rounds fractional inputs to integers', () => {
    expect(clampTextSize(32.4)).toBe(32)
    expect(clampTextSize(32.6)).toBe(33)
  })

  it('falls back to the default for non-finite inputs', () => {
    expect(clampTextSize(Number.NaN)).toBe(14)
    expect(clampTextSize(Number.POSITIVE_INFINITY)).toBe(14)
  })

  it('tightens line-height as text size grows', () => {
    expect(lineHeightForTextSize(14)).toBeCloseTo(1.5)
    expect(lineHeightForTextSize(96)).toBeCloseTo(1.1)
    expect(lineHeightForTextSize(32)).toBeLessThan(lineHeightForTextSize(14))
    expect(lineHeightForTextSize(56)).toBeLessThan(lineHeightForTextSize(32))
  })

  it('clamps line-height to the 1.1–1.5 band beyond the presets', () => {
    expect(lineHeightForTextSize(TEXT_SIZE_MIN)).toBe(1.5)
    expect(lineHeightForTextSize(144)).toBe(1.1)
    expect(lineHeightForTextSize(TEXT_SIZE_MAX)).toBe(1.1)
  })
})
