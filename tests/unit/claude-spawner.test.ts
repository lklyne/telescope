import { describe, expect, it } from 'vitest'
import { parseOutput } from '../../src/main/agent-fix/claude-spawner'

describe('parseOutput', () => {
  it('treats <<RESOLVE>> on its own line as resolving, with prior line as summary', () => {
    const stdout = 'Some preamble\nShrunk the header padding to 12px.\n<<RESOLVE>>\n'
    expect(parseOutput(stdout)).toEqual({
      summary: 'Shrunk the header padding to 12px.',
      shouldResolve: true,
    })
  })

  it('treats <<WAITING>> as not resolving', () => {
    const stdout = 'Looked at the component.\nNeed clarification on spacing.\n<<WAITING>>'
    expect(parseOutput(stdout)).toEqual({
      summary: 'Need clarification on spacing.',
      shouldResolve: false,
    })
  })

  it('extracts inline summary when marker is on the same line', () => {
    const stdout = 'Header padding reduced. <<RESOLVE>>'
    expect(parseOutput(stdout)).toEqual({
      summary: 'Header padding reduced.',
      shouldResolve: true,
    })
  })

  it('falls back to last line when no marker is present', () => {
    const stdout = 'Line one\nLine two\nFinal line without marker'
    expect(parseOutput(stdout)).toEqual({
      summary: 'Final line without marker',
      shouldResolve: false,
    })
  })

  it('handles empty output', () => {
    expect(parseOutput('')).toEqual({
      summary: '(no output)',
      shouldResolve: false,
    })
  })

  it('truncates very long summaries', () => {
    const long = 'x'.repeat(400)
    const stdout = `${long}\n<<RESOLVE>>`
    const result = parseOutput(stdout)
    expect(result.shouldResolve).toBe(true)
    expect(result.summary.length).toBeLessThanOrEqual(280)
    expect(result.summary.endsWith('…')).toBe(true)
  })
})
