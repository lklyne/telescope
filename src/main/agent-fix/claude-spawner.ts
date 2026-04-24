import { spawn } from 'child_process'
import type { FixConfig, FixProgressEvent } from '../../shared/types'
import { truncate } from '../../shared/annotation-utils'
import { getFixConfig } from '../runtime/preferences'
import { parseStreamLine } from './stream-json-parser'

const DEFAULT_LOCAL_BASE_URL = 'http://localhost:1234'
const DEFAULT_LOCAL_AUTH_TOKEN = 'lmstudio'

export function buildClaudeInvocation(
  prompt: string,
  config: FixConfig,
): { args: string[]; env: Record<string, string> } {
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose']
  const env: Record<string, string> = { NO_COLOR: '1' }

  if (config.model === 'local') {
    // Point Claude Code's CLI at an Anthropic-compatible local server
    // (LM Studio ≥ 0.4.1 exposes /v1/messages). The CLI still handles
    // skills, permissions, and stream-json on the client side.
    const baseUrl = config.baseUrl?.trim() || DEFAULT_LOCAL_BASE_URL
    const authToken = config.authToken?.trim() || DEFAULT_LOCAL_AUTH_TOKEN
    env.ANTHROPIC_BASE_URL = baseUrl
    env.ANTHROPIC_AUTH_TOKEN = authToken
    const modelId = config.modelId?.trim()
    if (modelId) {
      env.ANTHROPIC_MODEL = modelId
      args.push('--model', modelId)
    }
  } else if (config.model !== 'opus') {
    args.push('--model', `claude-${config.model}-4-6`)
  }

  if (config.permissions === 'dangerously') {
    args.push('--dangerously-skip-permissions')
  }

  return { args, env }
}

export interface FixResult {
  summary: string
  shouldResolve: boolean
  rawOutput: string
}

export interface InvokeOptions {
  onEvent?: (event: FixProgressEvent) => void
  timeout?: number
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

type SpawnerFn = (
  prompt: string,
  repoPath: string,
  options: InvokeOptions,
) => Promise<FixResult>

let override: SpawnerFn | null = null

export function _setSpawnerOverride(fn: SpawnerFn | null): void {
  override = fn
}

export function invokeClaude(
  prompt: string,
  repoPath: string,
  options: InvokeOptions = {},
): Promise<FixResult> {
  if (override) return override(prompt, repoPath, options)
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS

  return new Promise<FixResult>((resolve, reject) => {
    const { args, env } = buildClaudeInvocation(prompt, getFixConfig())
    const child = spawn(
      'claude',
      args,
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: repoPath,
        env: { ...process.env, ...env },
      },
    )

    let stdoutBuffer = ''
    let rawOutput = ''
    let finalText = ''

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`claude timed out after ${timeout}ms`))
    }, timeout)

    const handleLine = (line: string): void => {
      const parsed = parseStreamLine(line)
      if (!parsed) return
      if (parsed.finalText != null) finalText = parsed.finalText
      if (options.onEvent) options.onEvent(parsed.event)
    }

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      rawOutput += text
      stdoutBuffer += text
      let newlineIdx = stdoutBuffer.indexOf('\n')
      while (newlineIdx !== -1) {
        handleLine(stdoutBuffer.slice(0, newlineIdx))
        stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1)
        newlineIdx = stdoutBuffer.indexOf('\n')
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      rawOutput += text
      const line = text.trim().split(/\r?\n/).pop() ?? ''
      if (line && options.onEvent) {
        options.onEvent({
          kind: 'stderr',
          text: truncate(line, 320),
          timestamp: new Date().toISOString(),
        })
      }
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (stdoutBuffer.trim()) handleLine(stdoutBuffer)
      if (code !== 0 && !finalText) {
        reject(new Error(`claude exited with code ${code}`))
        return
      }
      const parsed = parseOutput(finalText || rawOutput)
      resolve({ ...parsed, rawOutput })
    })

    child.stdin.end()
  })
}

export function parseOutput(stdout: string): { summary: string; shouldResolve: boolean } {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0)
  if (lines.length === 0) {
    return { summary: '(no output)', shouldResolve: false }
  }
  let markerIndex = -1
  let shouldResolve = false
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (line === '<<RESOLVE>>' || line.endsWith('<<RESOLVE>>')) {
      markerIndex = i
      shouldResolve = true
      break
    }
    if (line === '<<WAITING>>' || line.endsWith('<<WAITING>>')) {
      markerIndex = i
      shouldResolve = false
      break
    }
  }
  if (markerIndex === -1) {
    return { summary: truncate(lines[lines.length - 1], 280), shouldResolve: false }
  }
  const markerLine = lines[markerIndex]
  const markerToken = shouldResolve ? '<<RESOLVE>>' : '<<WAITING>>'
  const inlineSummary = markerLine === markerToken
    ? ''
    : markerLine.slice(0, markerLine.length - markerToken.length).trim()
  const summary = inlineSummary || (markerIndex > 0 ? lines[markerIndex - 1] : '')
  return {
    summary: truncate(summary || '(no summary)', 280),
    shouldResolve,
  }
}
