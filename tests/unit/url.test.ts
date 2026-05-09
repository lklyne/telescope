import { describe, it, expect } from 'vitest'
import { looksLikeUrl } from '../../src/shared/url'

describe('looksLikeUrl', () => {
  it('accepts urls with explicit http(s) scheme', () => {
    expect(looksLikeUrl('https://example.com')).toBe(true)
    expect(looksLikeUrl('http://example.com/path?q=1')).toBe(true)
  })

  it('accepts bare host.tld inputs', () => {
    expect(looksLikeUrl('example.com')).toBe(true)
    expect(looksLikeUrl('sub.example.com/path')).toBe(true)
  })

  it('accepts localhost with optional port', () => {
    expect(looksLikeUrl('localhost')).toBe(true)
    expect(looksLikeUrl('localhost:4321')).toBe(true)
    expect(looksLikeUrl('localhost:4321/garden')).toBe(true)
  })

  it('rejects plain prose', () => {
    expect(looksLikeUrl('hello world')).toBe(false)
    expect(looksLikeUrl('hello')).toBe(false)
    expect(looksLikeUrl('')).toBe(false)
  })

  it('rejects multi-line and whitespace-bearing strings', () => {
    expect(looksLikeUrl('https://a.com\nhttps://b.com')).toBe(false)
    expect(looksLikeUrl('  https://example.com extra')).toBe(false)
  })

  it('rejects non-http schemes (avoid file://, javascript:, etc.)', () => {
    expect(looksLikeUrl('file:///tmp/foo')).toBe(false)
    expect(looksLikeUrl('javascript:alert(1)')).toBe(false)
    expect(looksLikeUrl('mailto:hi@example.com')).toBe(false)
  })

  it('trims surrounding whitespace before evaluating', () => {
    expect(looksLikeUrl('   https://example.com   ')).toBe(true)
    expect(looksLikeUrl('   example.com   ')).toBe(true)
  })
})
