import { spawnAsync } from '../shared/browse-handler'
import { truncate } from '../../shared/annotation-utils'

export interface FixResult {
  summary: string
  shouldResolve: boolean
  rawOutput: string
}

const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000
const DEFAULT_MAX_BUFFER = 5 * 1024 * 1024

type SpawnerFn = (prompt: string, repoPath: string, timeout: number) => Promise<FixResult>

let override: SpawnerFn | null = null

export function _setSpawnerOverride(fn: SpawnerFn | null): void {
  override = fn
}

export async function invokeClaude(
  prompt: string,
  repoPath: string,
  timeout: number = DEFAULT_TIMEOUT_MS,
): Promise<FixResult> {
  if (override) return override(prompt, repoPath, timeout)

  const { stdout, stderr } = await spawnAsync(
    'claude',
    ['-p', prompt, '--output-format', 'text'],
    { timeout, cwd: repoPath, maxBuffer: DEFAULT_MAX_BUFFER },
  )

  const parsed = parseOutput(stdout)
  if (!parsed.summary && stderr.trim()) {
    return {
      summary: `Claude exited without output. stderr: ${truncate(stderr.trim(), 400)}`,
      shouldResolve: false,
      rawOutput: stdout,
    }
  }
  return { ...parsed, rawOutput: stdout }
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
