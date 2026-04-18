import { describe, expect, it } from 'vitest'
import { parseStreamLine } from '../../src/main/agent-fix/stream-json-parser'

describe('parseStreamLine', () => {
  it('returns null for empty input', () => {
    expect(parseStreamLine('')).toBeNull()
    expect(parseStreamLine('   ')).toBeNull()
  })

  it('describes system init events', () => {
    const parsed = parseStreamLine(JSON.stringify({
      type: 'system',
      subtype: 'init',
      model: 'claude-sonnet-4-6',
    }))
    expect(parsed?.event.kind).toBe('system')
    expect(parsed?.event.text).toContain('claude-sonnet-4-6')
  })

  it('extracts assistant text blocks', () => {
    const parsed = parseStreamLine(JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Looking at the header component.' }],
      },
    }))
    expect(parsed?.event.kind).toBe('text')
    expect(parsed?.event.text).toBe('Looking at the header component.')
  })

  it('describes tool_use blocks with the most useful hint', () => {
    const parsed = parseStreamLine(JSON.stringify({
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          name: 'Read',
          input: { file_path: '/repo/src/Header.tsx' },
        }],
      },
    }))
    expect(parsed?.event.kind).toBe('tool_use')
    expect(parsed?.event.text).toBe('Read /repo/src/Header.tsx')
  })

  it('describes tool_result user events', () => {
    const parsed = parseStreamLine(JSON.stringify({
      type: 'user',
      message: {
        content: [{ type: 'tool_result', content: 'first line\nsecond line' }],
      },
    }))
    expect(parsed?.event.kind).toBe('tool_result')
    expect(parsed?.event.text).toBe('first line')
  })

  it('labels image tool_result content instead of showing empty', () => {
    const parsed = parseStreamLine(JSON.stringify({
      type: 'user',
      message: {
        content: [{
          type: 'tool_result',
          content: [{ type: 'image', source: { media_type: 'image/png' } }],
        }],
      },
    }))
    expect(parsed?.event.kind).toBe('tool_result')
    expect(parsed?.event.text).toBe('image (image/png)')
  })

  it('emits (empty output) instead of dropping empty string tool_results', () => {
    const parsed = parseStreamLine(JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_result', content: '' }] },
    }))
    expect(parsed?.event.kind).toBe('tool_result')
    expect(parsed?.event.text).toBe('(empty output)')
  })

  it('surfaces is_error flag in tool_result', () => {
    const parsed = parseStreamLine(JSON.stringify({
      type: 'user',
      message: {
        content: [{ type: 'tool_result', content: 'ENOENT: no such file', is_error: true }],
      },
    }))
    expect(parsed?.event.kind).toBe('tool_result')
    expect(parsed?.event.text).toContain('tool error')
  })

  it('carries finalText on result events', () => {
    const parsed = parseStreamLine(JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'Shrunk the header padding to 12px.\n<<RESOLVE>>',
    }))
    expect(parsed?.event.kind).toBe('result')
    expect(parsed?.finalText).toContain('<<RESOLVE>>')
  })

  it('falls back for unrecognized JSON', () => {
    const parsed = parseStreamLine('not json at all')
    expect(parsed?.event.kind).toBe('system')
    expect(parsed?.event.text).toContain('not json')
  })
})
