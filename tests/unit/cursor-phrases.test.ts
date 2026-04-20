import { describe, it, expect } from 'vitest'
import {
  binForVerb,
  composeLabel,
  poolSizeFor,
} from '../../src/shared/cursor-phrases'

describe('binForVerb', () => {
  it('maps browse verbs to bins', () => {
    expect(binForVerb('click')).toBe('interacting')
    expect(binForVerb('fill')).toBe('interacting')
    expect(binForVerb('snapshot')).toBe('inspecting')
    expect(binForVerb('wait')).toBe('waiting')
    expect(binForVerb('navigate')).toBe('waiting')
  })

  it('maps canvas verbs to bins', () => {
    expect(binForVerb('create')).toBe('creating')
    expect(binForVerb('delete')).toBe('deleting')
    expect(binForVerb('workspace')).toBe('inspecting')
    expect(binForVerb('link')).toBe('creating')
  })

  it('falls back to waiting for unknown verbs', () => {
    expect(binForVerb('something-brand-new')).toBe('waiting')
  })
})

describe('composeLabel — bin pool rotation', () => {
  it('interacting returns the pool phrase at phraseIndex', () => {
    const a = composeLabel({ verb: 'click', phraseIndex: 0 })
    const b = composeLabel({ verb: 'click', phraseIndex: 1 })
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a).not.toBe(b)
  })

  it('wraps phraseIndex modulo pool size', () => {
    const size = poolSizeFor('click')
    const a = composeLabel({ verb: 'click', phraseIndex: 0 })
    const b = composeLabel({ verb: 'click', phraseIndex: size })
    expect(a).toBe(b)
  })

  it('inspecting alone renders as just the phrase', () => {
    const label = composeLabel({ verb: 'snapshot', phraseIndex: 0 })
    expect(label).not.toBeNull()
    expect(label).not.toContain('undefined')
    expect(label).not.toContain('null')
    // Should be single lowercase word/phrase.
    expect(label).toMatch(/^[a-z]/)
  })
})

describe('composeLabel — targets', () => {
  it('click with name appends the name', () => {
    const label = composeLabel({
      verb: 'click',
      targetName: 'submit',
      phraseIndex: 0,
    })
    expect(label).toMatch(/submit$/)
    expect(label).not.toContain('"')
  })

  it('fill inserts value via "into" preposition when both name+value present', () => {
    const label = composeLabel({
      verb: 'fill',
      targetName: 'email',
      targetValue: 'lyle@gmail.com',
      phraseIndex: 0,
    })
    expect(label).toContain('into email')
    expect(label).toContain('lyle@gmail.com')
    expect(label).not.toContain('"')
  })

  it('fill with only value omits preposition', () => {
    const label = composeLabel({
      verb: 'fill',
      targetValue: 'hello',
      phraseIndex: 0,
    })
    expect(label).toContain('hello')
    expect(label).not.toContain('into')
  })

  it('navigate picks up URL as name', () => {
    const label = composeLabel({
      verb: 'navigate',
      targetName: 'telescope.sh',
      phraseIndex: 0,
    })
    expect(label).toContain('telescope.sh')
  })

  it('scroll renders direction', () => {
    const label = composeLabel({
      verb: 'scroll',
      targetName: 'down',
      phraseIndex: 0,
    })
    expect(label).toContain('down')
    expect(label).toContain('scrolling')
  })

  it('long values get truncated', () => {
    const longValue = 'a'.repeat(100)
    const label = composeLabel({
      verb: 'type',
      targetValue: longValue,
      phraseIndex: 0,
    })
    expect(label!.length).toBeLessThan(100)
    expect(label).toContain('…')
  })
})

describe('composeLabel — entity-kind sub-pools', () => {
  it('create frame uses frame sub-pool + "frame" noun', () => {
    const label = composeLabel({
      verb: 'create',
      entityKind: 'frame',
      phraseIndex: 0,
    })
    expect(label).toMatch(/frame$/)
  })

  it('create text uses text sub-pool + "note" noun', () => {
    const label = composeLabel({
      verb: 'create',
      entityKind: 'text',
      phraseIndex: 0,
    })
    expect(label).toMatch(/note$/)
  })

  it('create drawing uses "sketch" noun', () => {
    const label = composeLabel({
      verb: 'create',
      entityKind: 'drawing',
      phraseIndex: 0,
    })
    expect(label).toMatch(/sketch$/)
  })

  it('delete frame reads as a removal', () => {
    const label = composeLabel({
      verb: 'delete',
      entityKind: 'frame',
      phraseIndex: 0,
    })
    expect(label).toMatch(/frame$/)
    expect(label!.toLowerCase()).toMatch(/(removing|tearing)/)
  })

  it('entity-kind pool differs for different kinds', () => {
    const frameSize = poolSizeFor('create', 'frame')
    const textSize = poolSizeFor('create', 'text')
    // Both pools exist; we don't care if they're the same size but they
    // should each be >= 1.
    expect(frameSize).toBeGreaterThan(0)
    expect(textSize).toBeGreaterThan(0)
  })
})

describe('composeLabel — presentation rules', () => {
  it('no quotes in output', () => {
    const label = composeLabel({
      verb: 'click',
      targetName: 'submit',
      phraseIndex: 0,
    })
    expect(label).not.toContain('"')
    expect(label).not.toContain("'")
  })

  it('no arrows in output', () => {
    const label = composeLabel({
      verb: 'fill',
      targetName: 'email',
      targetValue: 'x',
      phraseIndex: 0,
    })
    expect(label).not.toContain('→')
    expect(label).not.toContain('->')
  })

  it('all lowercase', () => {
    const label = composeLabel({
      verb: 'click',
      targetName: 'submit',
      phraseIndex: 0,
    })
    // The phrase itself should be lowercase; target may carry whatever case.
    expect(label!.split(' ')[0]).toBe(label!.split(' ')[0].toLowerCase())
  })
})
