import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TOOL_DEFAULTS,
  normalizeToolDefaults,
} from '../../src/shared/tool-defaults'

describe('tool-defaults: normalizeToolDefaults', () => {
  it('returns full defaults when input is undefined', () => {
    const out = normalizeToolDefaults(undefined)
    expect(out).toEqual(DEFAULT_TOOL_DEFAULTS)
  })

  it('returns full defaults when input is malformed', () => {
    expect(normalizeToolDefaults(null)).toEqual(DEFAULT_TOOL_DEFAULTS)
    expect(normalizeToolDefaults('garbage')).toEqual(DEFAULT_TOOL_DEFAULTS)
    expect(normalizeToolDefaults(42)).toEqual(DEFAULT_TOOL_DEFAULTS)
  })

  it('round-trips a complete persisted blob', () => {
    const persisted = {
      'add-text': { 'sticky.color': '1', 'plain.color': '5' },
      'add-shape': { shapeKind: 'ellipse' as const, color: '#abcdef', strokeWidth: 4 },
      draw: { brushType: 'highlight' as const, color: '#111111', strokeWidth: 6 },
    }
    expect(normalizeToolDefaults(persisted)).toEqual(persisted)
  })

  it('fills gaps with defaults when only one scope is persisted', () => {
    const partial = { draw: { brushType: 'highlight' as const, color: '#aaa', strokeWidth: 9 } }
    const out = normalizeToolDefaults(partial)
    expect(out.draw).toEqual(partial.draw)
    expect(out['add-text']).toEqual(DEFAULT_TOOL_DEFAULTS['add-text'])
    expect(out['add-shape']).toEqual(DEFAULT_TOOL_DEFAULTS['add-shape'])
  })

  it('rejects unknown shapeKind / brushType, keeps the default', () => {
    const out = normalizeToolDefaults({
      'add-shape': { shapeKind: 'hexagon', color: '#fff', strokeWidth: 1 },
      draw: { brushType: 'spray', color: '#fff', strokeWidth: 1 },
    })
    expect(out['add-shape'].shapeKind).toBe(DEFAULT_TOOL_DEFAULTS['add-shape'].shapeKind)
    expect(out.draw.brushType).toBe(DEFAULT_TOOL_DEFAULTS.draw.brushType)
    // But valid sibling fields still come through:
    expect(out['add-shape'].color).toBe('#fff')
    expect(out['add-shape'].strokeWidth).toBe(1)
  })

  it('accepts plain.color: null as a valid override (reserved/inherit)', () => {
    const out = normalizeToolDefaults({
      'add-text': { 'sticky.color': '2', 'plain.color': null },
    })
    expect(out['add-text']['sticky.color']).toBe('2')
    expect(out['add-text']['plain.color']).toBe(null)
  })

  it('isolates per-tool keys: changing draw color does not affect shape color', () => {
    const persisted = {
      'add-shape': { ...DEFAULT_TOOL_DEFAULTS['add-shape'], color: '#aabbcc' },
      draw: { ...DEFAULT_TOOL_DEFAULTS.draw, color: '#112233' },
    }
    const out = normalizeToolDefaults(persisted)
    expect(out['add-shape'].color).toBe('#aabbcc')
    expect(out.draw.color).toBe('#112233')
  })
})
