import { describe, expect, it } from 'vitest'
import {
  SELECT_TOOL,
  applyEscape,
  applyPlacementCompletion,
  isAnnotationTool,
  isOneShot,
  isPersistent,
  isPlacementTool,
  toolDuration,
  toolGerund,
  type Tool,
  type ToolKind,
} from '../../src/shared/tool'

const ALL_KINDS: ToolKind[] = [
  'select',
  'add-page',
  'add-text',
  'add-document',
  'add-shape',
  'comment',
  'draw',
  'inspect',
]

const ONE_SHOT_KINDS: ToolKind[] = ['add-page', 'add-text', 'add-document', 'add-shape']
const PERSISTENT_KINDS: ToolKind[] = [
  'select',
  'comment',
  'draw',
  'inspect',
]

function makeTool(kind: ToolKind): Tool {
  switch (kind) {
    case 'add-text':
      return { kind: 'add-text', style: 'plain' }
    case 'add-shape':
      return { kind: 'add-shape', shapeKind: 'rectangle' }
    case 'select':
    case 'add-page':
    case 'add-document':
    case 'comment':
    case 'draw':
    case 'inspect':
      return { kind } as Tool
  }
}

describe('toolDuration table', () => {
  it.each(ONE_SHOT_KINDS)('classifies %s as one-shot', (kind) => {
    expect(toolDuration[kind]).toBe('one-shot')
    expect(isOneShot(kind)).toBe(true)
    expect(isPersistent(kind)).toBe(false)
  })

  it.each(PERSISTENT_KINDS)('classifies %s as persistent', (kind) => {
    expect(toolDuration[kind]).toBe('persistent')
    expect(isPersistent(kind)).toBe(true)
    expect(isOneShot(kind)).toBe(false)
  })

  it('covers every Tool kind', () => {
    for (const kind of ALL_KINDS) {
      expect(toolDuration[kind]).toBeDefined()
    }
  })
})

describe('applyPlacementCompletion (one-shot auto-revert)', () => {
  it.each(ONE_SHOT_KINDS)('reverts %s to select after a placement', (kind) => {
    expect(applyPlacementCompletion(makeTool(kind))).toEqual(SELECT_TOOL)
  })

  it.each(PERSISTENT_KINDS)('leaves persistent tool %s unchanged after placement', (kind) => {
    const tool = makeTool(kind)
    expect(applyPlacementCompletion(tool)).toEqual(tool)
  })

  it('preserves variant payload on persistent tools (no-op)', () => {
    // Sanity check — persistent variants don't carry payload but the function
    // must not synthesize one.
    expect(applyPlacementCompletion({ kind: 'comment' })).toEqual({ kind: 'comment' })
  })
})

describe('applyEscape', () => {
  it.each(ALL_KINDS)('returns select from any active tool (%s)', (kind) => {
    expect(applyEscape(makeTool(kind))).toEqual(SELECT_TOOL)
  })

  it('select → select is a no-op shape', () => {
    expect(applyEscape(SELECT_TOOL)).toEqual(SELECT_TOOL)
  })
})

describe('toolGerund mapping (cursor-label / status-bar narration)', () => {
  it('maps each tool kind to its lowercase gerund', () => {
    expect(toolGerund({ kind: 'select' })).toBe('selecting')
    expect(toolGerund({ kind: 'add-page' })).toBe('adding page')
    expect(toolGerund({ kind: 'add-text', style: 'plain' })).toBe('adding text')
    expect(toolGerund({ kind: 'add-text', style: 'sticky' })).toBe('adding sticky note')
    expect(toolGerund({ kind: 'add-document' })).toBe('adding document')
    expect(toolGerund({ kind: 'add-shape', shapeKind: 'rectangle' })).toBe('adding shape')
    expect(toolGerund({ kind: 'comment' })).toBe('commenting')
    expect(toolGerund({ kind: 'draw' })).toBe('drawing')
    expect(toolGerund({ kind: 'inspect' })).toBe('inspecting')
  })

  it('every tool kind has a defined gerund', () => {
    for (const kind of ALL_KINDS) {
      const label = toolGerund(makeTool(kind))
      expect(label).toMatch(/^[a-z][a-z ]*$/)
    }
  })
})

describe('isAnnotationTool / isPlacementTool helpers', () => {
  it('classifies the annotation cluster (replaces former AnnotationMode)', () => {
    expect(isAnnotationTool({ kind: 'comment' })).toBe(true)
    expect(isAnnotationTool({ kind: 'draw' })).toBe(true)
    expect(isAnnotationTool({ kind: 'select' })).toBe(false)
    expect(isAnnotationTool({ kind: 'inspect' })).toBe(false)
    expect(isAnnotationTool({ kind: 'add-page' })).toBe(false)
  })

  it('classifies the placement cluster (replaces former pendingPlacement)', () => {
    expect(isPlacementTool({ kind: 'add-page' })).toBe(true)
    expect(isPlacementTool({ kind: 'add-text', style: 'plain' })).toBe(true)
    expect(isPlacementTool({ kind: 'add-document' })).toBe(true)
    expect(isPlacementTool({ kind: 'add-shape', shapeKind: 'rectangle' })).toBe(true)
    expect(isPlacementTool({ kind: 'select' })).toBe(false)
    expect(isPlacementTool({ kind: 'comment' })).toBe(false)
  })
})
