/**
 * Dev-server manager.
 *
 * Owns the runtime side of "which Vite dev servers are connected to Specular."
 * Each connected repo persists as `{id, absolutePath, label}` in
 * userData/repos.json so connections survive across app launches.
 *
 * The actual `vite dev` child process is started lazily — only when
 * something asks `urlForComponent(repoId, ...)` — so quitting and reopening
 * Specular doesn't immediately spawn a flotilla of dev servers.
 *
 * Designed for testability: pass `{ userDataDir, spawn }` to `initDevServerManager`
 * to inject a tmpdir + a fake spawner. In production, src/main/index.ts wires
 * Electron's `app.getPath('userData')` and node's `child_process.spawn`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import type { ConnectedRepo, RepoStatus } from '../../shared/types'

export type { ConnectedRepo, RepoStatus }

export interface PersistedRepo {
  id: string
  absolutePath: string
  label: string
  /** User-set default URL for new frames; captured lazily from first localhost frame. */
  url?: string | null
  /** Folder name in the space (post auto-suffix). Defaults to basename of absolutePath. */
  folderName?: string
  /** Last time any canvas in this project was opened or edited. */
  lastActiveAt?: number
}

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: { cwd: string },
) => ChildProcess

export interface InitOptions {
  userDataDir: string
  spawn: SpawnFn
}

interface InternalRepo extends ConnectedRepo {
  child: ChildProcess | null
  startupResolvers: Array<(url: string | null) => void>
  startupTimer: NodeJS.Timeout | null
}

const repos = new Map<string, InternalRepo>()
const events = new EventEmitter()
let userDataDir: string | null = null
let spawnFn: SpawnFn | null = null

const LOCAL_URL_REGEX = /Local:\s+(https?:\/\/[^\s/]+(?::\d+)?\/?)/i
const STARTUP_TIMEOUT_MS = 30_000

function reposFile(): string {
  if (!userDataDir) throw new Error('dev-server-manager not initialized')
  return join(userDataDir, 'repos.json')
}

function repoIdFor(absolutePath: string): string {
  return createHash('sha256').update(absolutePath).digest('hex').slice(0, 16)
}

function basename(absolutePath: string): string {
  const trimmed = absolutePath.replace(/\/+$/, '')
  return trimmed.split('/').pop() ?? trimmed
}

function persist(): void {
  const payload: { repos: PersistedRepo[] } = {
    repos: Array.from(repos.values()).map((r) => ({
      id: r.id,
      absolutePath: r.absolutePath,
      label: r.label,
      url: r.url ?? null,
      folderName: r.folderName,
      lastActiveAt: r.lastActiveAt,
    })),
  }
  if (!userDataDir) return
  if (!existsSync(userDataDir)) mkdirSync(userDataDir, { recursive: true })
  const file = reposFile()
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8')
  renameSync(tmp, file)
}

function loadPersisted(): void {
  if (!userDataDir) return
  if (!existsSync(reposFile())) return
  try {
    const raw = readFileSync(reposFile(), 'utf8')
    const parsed = JSON.parse(raw) as { repos?: PersistedRepo[] }
    for (const r of parsed.repos ?? []) {
      if (!r.id || !r.absolutePath) continue
      repos.set(r.id, {
        id: r.id,
        absolutePath: r.absolutePath,
        label: r.label ?? basename(r.absolutePath),
        url: r.url ?? null,
        folderName: r.folderName ?? basename(r.absolutePath),
        lastActiveAt: r.lastActiveAt ?? 0,
        status: 'stopped',
        port: null,
        baseUrl: null,
        child: null,
        startupResolvers: [],
        startupTimer: null,
      })
    }
  } catch {
    // Corrupt repos.json — start fresh; better than throwing during boot.
  }
}

function toPublic(r: InternalRepo): ConnectedRepo {
  return {
    id: r.id,
    absolutePath: r.absolutePath,
    label: r.label,
    status: r.status,
    port: r.port,
    baseUrl: r.baseUrl,
    lastError: r.lastError,
    url: r.url ?? null,
    folderName: r.folderName,
    health: existsSync(r.absolutePath) ? 'ok' : 'broken',
    lastActiveAt: r.lastActiveAt ?? 0,
  }
}

function notifyChange(): void {
  events.emit('change', listRepos())
}

export function initDevServerManager(options: InitOptions): void {
  userDataDir = options.userDataDir
  spawnFn = options.spawn
  loadPersisted()
}

export function listRepos(): ConnectedRepo[] {
  return Array.from(repos.values()).map(toPublic)
}

export function getRepo(id: string): ConnectedRepo | null {
  const r = repos.get(id)
  return r ? toPublic(r) : null
}

export function findRepoForPath(absolutePath: string): ConnectedRepo | null {
  // Prefer the longest matching prefix: if the user has both ~/Developer
  // and ~/Developer/my-app connected, a file inside my-app should resolve
  // to my-app, not the parent. Otherwise nested repos silently lose.
  let best: InternalRepo | null = null
  for (const r of repos.values()) {
    if (absolutePath !== r.absolutePath && !absolutePath.startsWith(r.absolutePath + '/')) {
      continue
    }
    if (!best || r.absolutePath.length > best.absolutePath.length) {
      best = r
    }
  }
  return best ? toPublic(best) : null
}

export function connectRepo(absolutePath: string, label?: string): ConnectedRepo {
  const id = repoIdFor(absolutePath)
  const existing = repos.get(id)
  if (existing) return toPublic(existing)
  const baseLabel = label ?? basename(absolutePath)
  const folderName = uniqueFolderName(baseLabel)
  const entry: InternalRepo = {
    id,
    absolutePath,
    label: folderName,
    folderName,
    url: null,
    lastActiveAt: Date.now(),
    status: 'stopped',
    port: null,
    baseUrl: null,
    child: null,
    startupResolvers: [],
    startupTimer: null,
  }
  repos.set(id, entry)
  persist()
  notifyChange()
  return toPublic(entry)
}

/** Produces a folder name unique among already-connected projects' folderNames. */
function uniqueFolderName(base: string): string {
  const existing = new Set(
    Array.from(repos.values()).map((r) => r.folderName ?? basename(r.absolutePath)),
  )
  if (!existing.has(base)) return base
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`
    if (!existing.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

/** Update the manual default URL (Q5/Q6 — captured from first localhost frame). */
export function setProjectUrl(id: string, url: string | null): void {
  const entry = repos.get(id)
  if (!entry) return
  entry.url = url
  persist()
  notifyChange()
}

/** Update the codebase path after a "Locate folder…" recovery (Q11). Id stays stable. */
export function relinkProject(id: string, newAbsolutePath: string): ConnectedRepo | null {
  const entry = repos.get(id)
  if (!entry) return null
  entry.absolutePath = newAbsolutePath
  persist()
  notifyChange()
  return toPublic(entry)
}

/** Bump lastActiveAt to drive sidebar ordering (Q20). */
export function bumpProjectLastActive(id: string): void {
  const entry = repos.get(id)
  if (!entry) return
  entry.lastActiveAt = Date.now()
  persist()
  // No notifyChange — ordering refreshes on next sidebar build.
}

/** Rename a project's folder name (and label). Caller is responsible for moving the
 *  on-disk folder inside the space; this only updates the in-memory + persisted state. */
export function renameProjectLabel(id: string, newLabel: string): ConnectedRepo | null {
  const entry = repos.get(id)
  if (!entry) return null
  const folderName = uniqueFolderName(newLabel)
  entry.label = folderName
  entry.folderName = folderName
  persist()
  notifyChange()
  return toPublic(entry)
}

// --- Project-named read aliases (Q2 — `repo` → `project` rename, additive shims) ---
// Note: connect/disconnect intentionally NOT aliased here. Higher-level operations
// (folder creation in the space, on-disk cleanup) live in space-manager.ts; raw
// connectRepo/disconnectRepo only mutate the in-memory + persisted project list.

export const listProjects = listRepos
export const getProject = getRepo
export const findProjectForPath = findRepoForPath

export async function disconnectRepo(id: string): Promise<void> {
  const entry = repos.get(id)
  if (!entry) return
  await stopChild(entry)
  repos.delete(id)
  persist()
  notifyChange()
}

function stopChild(entry: InternalRepo): Promise<void> {
  return new Promise((resolve) => {
    const child = entry.child
    if (!child) {
      entry.status = 'stopped'
      entry.port = null
      entry.baseUrl = null
      resolve()
      return
    }
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      entry.child = null
      entry.status = 'stopped'
      entry.port = null
      entry.baseUrl = null
      resolve()
    }
    child.once('exit', settle)
    try {
      child.kill('SIGTERM')
    } catch {
      settle()
      return
    }
    setTimeout(() => {
      if (settled) return
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
      settle()
    }, 2_000)
  })
}

function clearStartupTimer(entry: InternalRepo): void {
  if (entry.startupTimer) {
    clearTimeout(entry.startupTimer)
    entry.startupTimer = null
  }
}

function flushStartupResolvers(entry: InternalRepo, url: string | null): void {
  clearStartupTimer(entry)
  const pending = entry.startupResolvers.splice(0)
  for (const resolve of pending) resolve(url)
}

function attachChildHandlers(entry: InternalRepo, child: ChildProcess): void {
  const handleStdoutLine = (line: string) => {
    const match = LOCAL_URL_REGEX.exec(line)
    if (!match) return
    const url = match[1].replace(/\/$/, '')
    try {
      const parsed = new URL(url)
      entry.port = Number(parsed.port) || null
      entry.baseUrl = url
      entry.status = 'running'
      entry.lastError = undefined
      flushStartupResolvers(entry, url)
      notifyChange()
    } catch {
      // ignore malformed URL
    }
  }

  const wireStdout = (stream: NodeJS.ReadableStream | null) => {
    if (!stream) return
    let buffer = ''
    stream.on('data', (chunk: Buffer | string) => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      let newlineIdx: number
      while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIdx)
        buffer = buffer.slice(newlineIdx + 1)
        handleStdoutLine(line)
      }
    })
  }

  wireStdout(child.stdout)
  // Surface stderr to the main-process console without buffering — vite emits
  // useful error context here that would otherwise be lost.
  child.stderr?.on('data', (chunk: Buffer | string) => {
    process.stderr.write(typeof chunk === 'string' ? chunk : chunk)
  })

  child.once('exit', (code) => {
    entry.child = null
    if (entry.status !== 'errored') {
      entry.status = 'stopped'
    }
    if (code !== 0 && code !== null) {
      entry.lastError = `vite exited with code ${code}`
      entry.status = 'errored'
    }
    entry.port = null
    entry.baseUrl = null
    flushStartupResolvers(entry, null)
    notifyChange()
  })

  child.once('error', (err) => {
    entry.lastError = err.message
    entry.status = 'errored'
    flushStartupResolvers(entry, null)
    notifyChange()
  })
}

function startChild(entry: InternalRepo): Promise<string | null> {
  if (!spawnFn) throw new Error('dev-server-manager not initialized')
  if (entry.status === 'running' && entry.baseUrl) {
    return Promise.resolve(entry.baseUrl)
  }
  if (entry.status === 'starting') {
    return new Promise((resolve) => entry.startupResolvers.push(resolve))
  }
  entry.status = 'starting'
  entry.lastError = undefined
  notifyChange()
  const child = spawnFn('npx', ['vite', 'dev'], { cwd: entry.absolutePath })
  entry.child = child
  attachChildHandlers(entry, child)
  return new Promise((resolve) => {
    entry.startupResolvers.push(resolve)
    if (entry.startupTimer) return
    entry.startupTimer = setTimeout(() => {
      entry.startupTimer = null
      if (entry.status === 'starting') {
        entry.status = 'errored'
        entry.lastError = 'startup timed out'
        flushStartupResolvers(entry, null)
        notifyChange()
      }
    }, STARTUP_TIMEOUT_MS)
  })
}

export async function urlForComponent(
  repoId: string,
  repoRelativePath: string,
): Promise<string | null> {
  const entry = repos.get(repoId)
  if (!entry) return null
  const baseUrl = await startChild(entry)
  if (!baseUrl) return null
  const cleaned = repoRelativePath.replace(/^\/+/, '')
  return `${baseUrl}/__specular?path=${encodeURIComponent(cleaned)}`
}

export function onChange(listener: (repos: ConnectedRepo[]) => void): () => void {
  events.on('change', listener)
  return () => events.off('change', listener)
}

export async function shutdownDevServerManager(): Promise<void> {
  const entries = Array.from(repos.values())
  await Promise.all(entries.map(stopChild))
}

/** Test-only: wipe internal state so a fresh init can run. */
export function __resetDevServerManagerForTests(): void {
  repos.clear()
  events.removeAllListeners()
  userDataDir = null
  spawnFn = null
}
