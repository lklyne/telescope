import { describe, it, expect } from 'vitest'
import { parseArgs } from '../../src/main/cli-parser'

describe('parseArgs', () => {
  it('extracts verb from simple command', () => {
    const result = parseArgs(['workspace'])
    expect(result.verb).toBe('workspace')
    expect(result.positional).toEqual([])
  })

  it('extracts verb and positional args', () => {
    const result = parseArgs(['click', '@e5'])
    expect(result.verb).toBe('click')
    expect(result.positional).toEqual(['@e5'])
  })

  it('extracts named flags', () => {
    const result = parseArgs(['snapshot', '--page', 'abc123'])
    expect(result.verb).toBe('snapshot')
    expect(result.flags.page).toBe('abc123')
  })

  it('extracts boolean flags', () => {
    const result = parseArgs(['snapshot', '-i'])
    expect(result.verb).toBe('snapshot')
    expect(result.boolFlags.has('i')).toBe(true)
  })

  it('handles mixed flags and positionals', () => {
    const result = parseArgs(['create', 'page', 'https://example.com', '--preset', '7', '--landscape'])
    expect(result.verb).toBe('create')
    expect(result.positional).toEqual(['page', 'https://example.com'])
    expect(result.flags.preset).toBe('7')
    expect(result.boolFlags.has('landscape')).toBe(true)
  })

  it('handles --page shorthand -f', () => {
    const result = parseArgs(['snapshot', '-f', 'page-123', '-i'])
    expect(result.flags.f).toBe('page-123')
    expect(result.boolFlags.has('i')).toBe(true)
  })

  it('handles empty input', () => {
    const result = parseArgs([])
    expect(result.verb).toBe('')
    expect(result.positional).toEqual([])
  })

  it('handles -- separator', () => {
    const result = parseArgs(['fill', '@e3', '--', '--not-a-flag'])
    expect(result.verb).toBe('fill')
    expect(result.positional).toEqual(['@e3', '--not-a-flag'])
  })

  it('handles multiple positionals for fill', () => {
    const result = parseArgs(['fill', '@e12', 'hello', 'world'])
    expect(result.verb).toBe('fill')
    expect(result.positional).toEqual(['@e12', 'hello', 'world'])
  })

  it('handles annotation filter flags', () => {
    const result = parseArgs(['annotations', '--status', 'pending', '--url', 'https://example.com'])
    expect(result.verb).toBe('annotations')
    expect(result.flags.status).toBe('pending')
    expect(result.flags.url).toBe('https://example.com')
  })

  it('handles update with --at coordinates', () => {
    const result = parseArgs(['update', 'page-123', '--at', '800,400', '--preset', '3'])
    expect(result.verb).toBe('update')
    expect(result.positional).toEqual(['page-123'])
    expect(result.flags.at).toBe('800,400')
    expect(result.flags.preset).toBe('3')
  })

  it('preserves rest for passthrough', () => {
    const result = parseArgs(['eval', 'document.title'])
    expect(result.verb).toBe('eval')
    expect(result.rest).toEqual(['document.title'])
  })

  it('handles record subcommands', () => {
    const result = parseArgs(['record', 'start', 'page-123', '--output', '/tmp/video.webm'])
    expect(result.verb).toBe('record')
    expect(result.positional).toEqual(['start', 'page-123'])
    expect(result.flags.output).toBe('/tmp/video.webm')
  })

  it('handles help flag', () => {
    const result = parseArgs(['--help'])
    expect(result.boolFlags.has('help')).toBe(true)
    expect(result.verb).toBe('')
  })
})
