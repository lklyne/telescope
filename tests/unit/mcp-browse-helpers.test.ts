import { describe, it, expect } from 'vitest'
import { splitShellArgs, parseCommandArgs } from '../../src/main/mcp-browse'

describe('splitShellArgs', () => {
  it('splits simple space-separated args', () => {
    expect(splitShellArgs('click @e5')).toEqual(['click', '@e5'])
  })

  it('handles double-quoted strings', () => {
    expect(splitShellArgs('fill @e3 "hello world"')).toEqual([
      'fill', '@e3', 'hello world',
    ])
  })

  it('handles single-quoted strings', () => {
    expect(splitShellArgs("snapshot -s '#main'")).toEqual([
      'snapshot', '-s', '#main',
    ])
  })

  it('handles escaped characters', () => {
    expect(splitShellArgs('fill @e1 hello\\ world')).toEqual([
      'fill', '@e1', 'hello world',
    ])
  })

  it('handles empty input', () => {
    expect(splitShellArgs('')).toEqual([])
    expect(splitShellArgs('   ')).toEqual([])
  })

  it('handles multiple whitespace between args', () => {
    expect(splitShellArgs('click   @e5')).toEqual(['click', '@e5'])
  })

  it('handles nested quotes', () => {
    expect(splitShellArgs('fill @e1 "it\'s here"')).toEqual([
      'fill', '@e1', "it's here",
    ])
  })
})

describe('parseCommandArgs', () => {
  it('extracts verb from simple command', () => {
    const result = parseCommandArgs('snapshot')
    expect(result.verb).toBe('snapshot')
    expect(result.ref).toBeNull()
  })

  it('extracts verb and ref', () => {
    const result = parseCommandArgs('click @e5')
    expect(result.verb).toBe('click')
    expect(result.ref).toBe('@e5')
  })

  it('skips flags with values', () => {
    const result = parseCommandArgs('snapshot -s "#main" --depth 3')
    expect(result.verb).toBe('snapshot')
    expect(result.ref).toBeNull()
  })

  it('handles fill command with ref and text', () => {
    const result = parseCommandArgs('fill @e12 hello')
    expect(result.verb).toBe('fill')
    expect(result.ref).toBe('@e12')
  })

  it('returns null verb for empty command', () => {
    const result = parseCommandArgs('')
    expect(result.verb).toBeNull()
    expect(result.ref).toBeNull()
  })

  it('skips boolean flags', () => {
    const result = parseCommandArgs('snapshot -i')
    expect(result.verb).toBe('snapshot')
    expect(result.ref).toBeNull()
  })

  it('handles CDP flag before verb', () => {
    const result = parseCommandArgs('--cdp ws://localhost:9222 click @e3')
    expect(result.verb).toBe('click')
    expect(result.ref).toBe('@e3')
  })
})
