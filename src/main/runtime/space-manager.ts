/**
 * Space manager.
 *
 * Owns the user's "space" folder (default `~/Documents/Telescope/`) and the
 * sectioned canvas layout that lives inside it. Reads:
 *
 *   <space>/*.canvas                          → Scratchpad section
 *   <space>/<projectFolder>/*.canvas          → one project section per connected codebase
 *
 * Project metadata (codebase path, default URL, lastActiveAt) is owned by
 * dev-server-manager.ts. Ephemeral UI state (active canvas, expansion, view
 * mode) is owned by sidebar-state.ts. This module is the single seam through
 * which both worlds talk to the filesystem.
 *
 * File watching uses chokidar with a depth-2 glob; self-issued mutations
 * register a short-lived suppression marker so a Telescope-driven rename
 * doesn't flicker as remove-then-add in the sidebar.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { EventEmitter } from 'node:events'
import * as chokidar from 'chokidar'
import {
  connectRepo,
  disconnectRepo,
  getRepo,
  listRepos,
  relinkProject,
  renameProjectLabel,
  setProjectUrl,
  bumpProjectLastActive,
} from './dev-server-manager'
import {
  SCRATCHPAD_PROJECT_ID,
  getSpacePath,
  setSpacePath,
  dropProjectFromState,
  renameCanvasInState,
  dropCanvasFromState,
} from './sidebar-state'
import type { ConnectedProject, SidebarProjectSection } from '../../shared/types'

const events = new EventEmitter()
let watcher: chokidar.FSWatcher | null = null

/** Self-issued mutation suppression. Maps absolute path → expiry timestamp. */
const suppressedPaths = new Map<string, number>()
const SUPPRESS_WINDOW_MS = 500

function suppress(path: string): void {
  suppressedPaths.set(path, Date.now() + SUPPRESS_WINDOW_MS)
}

function isSuppressed(path: string): boolean {
  const expiry = suppressedPaths.get(path)
  if (!expiry) return false
  if (Date.now() > expiry) {
    suppressedPaths.delete(path)
    return false
  }
  return true
}

// --- Initialization ---------------------------------------------------------

export function initSpaceManager(): void {
  ensureSpaceExists()
  startWatcher()
}

export function shutdownSpaceManager(): void {
  if (watcher) {
    watcher.close().catch(() => {})
    watcher = null
  }
}

function ensureSpaceExists(): void {
  const space = getSpacePath()
  if (!existsSync(space)) mkdirSync(space, { recursive: true })
}

function startWatcher(): void {
  if (watcher) return
  const space = getSpacePath()
  watcher = chokidar.watch(`${space}`, {
    depth: 2,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  })
  let pending: NodeJS.Timeout | null = null
  const debouncedNotify = () => {
    if (pending) clearTimeout(pending)
    pending = setTimeout(() => {
      pending = null
      events.emit('canvases-changed')
    }, 100)
  }
  const handle = (path: string) => {
    if (!path.endsWith('.canvas')) return
    if (isSuppressed(path)) return
    debouncedNotify()
  }
  watcher.on('add', handle).on('unlink', handle).on('addDir', handle).on('unlinkDir', handle)
}

export function onSpaceChange(listener: () => void): () => void {
  events.on('canvases-changed', listener)
  return () => events.off('canvases-changed', listener)
}

/** Re-point the space at a new folder. Does NOT move existing files (Obsidian shape). */
export function changeSpacePath(newPath: string): void {
  shutdownSpaceManager()
  setSpacePath(newPath)
  ensureSpaceExists()
  startWatcher()
  events.emit('canvases-changed')
}

// --- Path helpers -----------------------------------------------------------

export function isScratchpad(projectId: string): boolean {
  return projectId === SCRATCHPAD_PROJECT_ID
}

/** Folder on disk where canvases for the given project live. */
export function canvasFolderFor(projectId: string): string {
  if (isScratchpad(projectId)) return getSpacePath()
  const project = getRepo(projectId)
  if (!project) throw new Error(`Unknown project ${projectId}`)
  const folderName = project.folderName ?? basename(project.absolutePath)
  return join(getSpacePath(), folderName)
}

export function canvasFilePathFor(projectId: string, canvasName: string): string {
  return join(canvasFolderFor(projectId), `${canvasName}.canvas`)
}

function sanitize(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_').trim() || 'Untitled'
}

// --- Project lifecycle ------------------------------------------------------

export interface ConnectProjectOptions {
  absolutePath: string
  label?: string
  url?: string | null
}

/** Connects a codebase folder as a project. Creates `<space>/<folderName>/` on disk. */
export function connectProject(opts: ConnectProjectOptions): ConnectedProject {
  const project = connectRepo(opts.absolutePath, opts.label)
  const folder = canvasFolderFor(project.id)
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true })
  if (opts.url !== undefined) setProjectUrl(project.id, opts.url)
  return getRepo(project.id) ?? project
}

/** Removes the project: rms the in-space folder, kills dev server, drops persisted state.
 *  The codebase folder on disk is NEVER touched. */
export async function deleteProject(id: string): Promise<void> {
  if (isScratchpad(id)) return
  const project = getRepo(id)
  if (!project) return
  const folder = canvasFolderFor(id)
  await disconnectRepo(id) // kills dev server, removes from repos.json
  if (existsSync(folder)) {
    suppress(folder)
    rmSync(folder, { recursive: true, force: true })
  }
  dropProjectFromState(id)
  events.emit('canvases-changed')
}

/** Repoints a project's codebase path after a "Locate folder…" recovery. */
export function relocateProject(id: string, newAbsolutePath: string): ConnectedProject | null {
  return relinkProject(id, newAbsolutePath)
}

/** Renames a project. Renames the in-space folder atomically; keeps id stable. */
export function renameProject(id: string, newLabel: string): ConnectedProject | null {
  if (isScratchpad(id)) return null
  const project = getRepo(id)
  if (!project) return null
  const oldFolder = canvasFolderFor(id)
  const updated = renameProjectLabel(id, sanitize(newLabel))
  if (!updated) return null
  const newFolder = canvasFolderFor(id)
  if (oldFolder !== newFolder && existsSync(oldFolder)) {
    suppress(oldFolder)
    suppress(newFolder)
    renameSync(oldFolder, newFolder)
  } else if (!existsSync(newFolder)) {
    mkdirSync(newFolder, { recursive: true })
  }
  events.emit('canvases-changed')
  return updated
}

// --- Canvas file operations -------------------------------------------------

export interface CanvasFileEntry {
  name: string
  path: string
  updatedAt: number
}

export function listCanvasFiles(projectId: string): CanvasFileEntry[] {
  const folder = isScratchpad(projectId) ? getSpacePath() : canvasFolderFor(projectId)
  if (!existsSync(folder)) return []
  const entries: CanvasFileEntry[] = []
  for (const fileName of readdirSync(folder)) {
    if (!fileName.endsWith('.canvas')) continue
    const path = join(folder, fileName)
    let updatedAt = 0
    try {
      updatedAt = statSync(path).mtimeMs
    } catch {
      continue
    }
    entries.push({
      name: fileName.slice(0, -'.canvas'.length),
      path,
      updatedAt,
    })
  }
  return entries.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Creates an empty `.canvas` file. Returns the chosen unique name. */
export function createCanvasFile(projectId: string, requestedName = 'Untitled'): string {
  const base = sanitize(requestedName)
  const folder = isScratchpad(projectId) ? getSpacePath() : canvasFolderFor(projectId)
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true })
  const existing = new Set(listCanvasFiles(projectId).map((c) => c.name))
  let name = base
  let suffix = 2
  while (existing.has(name)) {
    name = `${base} ${suffix}`
    suffix++
  }
  const path = join(folder, `${name}.canvas`)
  suppress(path)
  writeFileSync(path, '{}', 'utf8')
  events.emit('canvases-changed')
  return name
}

export function deleteCanvasFileFor(projectId: string, canvasName: string): void {
  const path = canvasFilePathFor(projectId, canvasName)
  if (existsSync(path)) {
    suppress(path)
    rmSync(path)
  }
  dropCanvasFromState(projectId, canvasName)
  events.emit('canvases-changed')
}

export function renameCanvasFileFor(
  projectId: string,
  oldName: string,
  newName: string,
): { ok: true; finalName: string } | { ok: false; reason: 'collision' | 'invalid' | 'missing' } {
  const sanitized = sanitize(newName)
  if (!sanitized) return { ok: false, reason: 'invalid' }
  if (sanitized === oldName) return { ok: true, finalName: oldName }
  const oldPath = canvasFilePathFor(projectId, oldName)
  const newPath = canvasFilePathFor(projectId, sanitized)
  if (!existsSync(oldPath)) return { ok: false, reason: 'missing' }
  if (existsSync(newPath)) return { ok: false, reason: 'collision' }
  suppress(oldPath)
  suppress(newPath)
  // Ensure parent dir exists (paranoia — should be impossible to hit since old exists).
  const parent = dirname(newPath)
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true })
  renameSync(oldPath, newPath)
  renameCanvasInState(projectId, oldName, sanitized)
  events.emit('canvases-changed')
  return { ok: true, finalName: sanitized }
}

// --- Section assembly (consumed by sidebar-builder) -------------------------

/** Marks a project as recently active for sidebar ordering (Q20). */
export function markProjectActive(projectId: string): void {
  if (isScratchpad(projectId)) return
  bumpProjectLastActive(projectId)
}

/** Returns sections in render order: Scratchpad first, then projects sorted by lastActiveAt desc. */
export function listProjectSectionsRaw(): ConnectedProject[] {
  return [...listRepos()].sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0))
}

/** Build the Scratchpad pseudo-project entry. */
export function scratchpadSection(): SidebarProjectSection {
  return {
    id: SCRATCHPAD_PROJECT_ID,
    label: 'Scratchpad',
    isScratchpad: true,
    health: 'ok',
    canvases: [],
  }
}
