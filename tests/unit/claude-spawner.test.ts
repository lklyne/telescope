import { describe, expect, it } from 'vitest'
import { buildClaudeInvocation, parseOutput } from '../../src/main/agent-fix/claude-spawner'
import type { FixConfig } from '../../src/shared/types'

const base: FixConfig = { model: 'opus', permissions: 'default', configured: true }

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

describe('buildClaudeInvocation', () => {
  it('omits --model for Opus and does not set any Anthropic env', () => {
    const { args, env } = buildClaudeInvocation('hi', base)
    expect(args).toEqual(['-p', 'hi', '--output-format', 'stream-json', '--verbose'])
    expect(env).toEqual({ NO_COLOR: '1' })
  })

  it('adds --model flag for Sonnet and Haiku', () => {
    expect(buildClaudeInvocation('hi', { ...base, model: 'sonnet' }).args).toContain('claude-sonnet-4-6')
    expect(buildClaudeInvocation('hi', { ...base, model: 'haiku' }).args).toContain('claude-haiku-4-6')
  })

  it('appends --dangerously-skip-permissions when permissions === dangerously', () => {
    const { args } = buildClaudeInvocation('hi', { ...base, permissions: 'dangerously' })
    expect(args).toContain('--dangerously-skip-permissions')
  })

  it('routes to a local Anthropic-compatible endpoint when model === local', () => {
    const { args, env } = buildClaudeInvocation('hi', {
      ...base,
      model: 'local',
      baseUrl: 'http://localhost:1234',
      modelId: 'qwen/qwen3-coder-30b',
      authToken: 'secret',
    })
    expect(env.ANTHROPIC_BASE_URL).toBe('http://localhost:1234')
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('secret')
    expect(env.ANTHROPIC_MODEL).toBe('qwen/qwen3-coder-30b')
    expect(args).toContain('--model')
    expect(args).toContain('qwen/qwen3-coder-30b')
    expect(args).not.toContain('claude-local-4-6')
  })

  it('falls back to LM Studio defaults when baseUrl / authToken are missing', () => {
    const { env, args } = buildClaudeInvocation('hi', { ...base, model: 'local' })
    expect(env.ANTHROPIC_BASE_URL).toBe('http://localhost:1234')
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('lmstudio')
    expect(env.ANTHROPIC_MODEL).toBeUndefined()
    expect(args).not.toContain('--model')
  })

  it('trims whitespace in local endpoint config', () => {
    const { env } = buildClaudeInvocation('hi', {
      ...base,
      model: 'local',
      baseUrl: '  http://host:9000  ',
      authToken: '  token  ',
      modelId: '  m  ',
    })
    expect(env.ANTHROPIC_BASE_URL).toBe('http://host:9000')
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('token')
    expect(env.ANTHROPIC_MODEL).toBe('m')
  })
})
