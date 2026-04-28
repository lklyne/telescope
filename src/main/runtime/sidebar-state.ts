/**
 * Persists sidebar UI state to userData/sidebar-state.json.
 *
 * This file owns the *ephemeral* per-project state that used to live in
 * `<workspaceDir>/workspace-meta.json`:
 *   - which canvas is active in each project
 *   - which canvases have their entity tree expanded
 *   - the last view mode (canvas vs browser)
 *   - the configured space path
 *
 * Canvas content lives in the user's space folder (.canvas files). This file
 * is intentionally *not* portable — it's UI state, not data.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { SidebarStateFile, WorkspaceViewMode } from '../../shared/types'

export const SCRATCHPAD_PROJECT_ID = 'scratchpad'
const STATE_FILE = 'sidebar-state.json'
const DEFAULT_SPACE_PATH = join(homedir(), 'Documents', 'Telescope')

let userDataDir: string | null = null
let cache: SidebarStateFile | null = null

export function initSidebarState(dir: string): void {
  userDataDir = dir
  cache = load()
}

function statePath(): string {
  if (!userDataDir) throw new Error('sidebar-state not initialized')
  return join(userDataDir, STATE_FILE)
}

function makeDefault(): SidebarStateFile {
  return {
    version: 1,
    spacePath: DEFAULT_SPACE_PATH,
    projectOrder: [],
    projects: {
      [SCRATCHPAD_PROJECT_ID]: {
        activeCanvas: null,
        expandedMap: {},
        canvasIds: {},
      },
    },
    activeProjectId: SCRATCHPAD_PROJECT_ID,
  }
}

function load(): SidebarStateFile {
  if (!userDataDir) throw new Error('sidebar-state not initialized')
  const path = statePath()
  if (!existsSync(path)) return makeDefault()
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as SidebarStateFile
    if (parsed.version !== 1) return makeDefault()
    if (!parsed.projects[SCRATCHPAD_PROJECT_ID]) {
      parsed.projects[SCRATCHPAD_PROJECT_ID] = { activeCanvas: null, expandedMap: {}, canvasIds: {} }
    }
    // Backfill canvasIds for older state files.
    for (const slot of Object.values(parsed.projects)) {
      if (!slot.canvasIds) slot.canvasIds = {}
    }
    return parsed
  } catch {
    return makeDefault()
  }
}

function persist(): void {
  if (!cache || !userDataDir) return
  if (!existsSync(userDataDir)) mkdirSync(userDataDir, { recursive: true })
  const path = statePath()
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8')
  renameSync(tmp, path)
}

function ensure(): SidebarStateFile {
  if (!cache) cache = load()
  return cache
}

export function getSpacePath(): string {
  return ensure().spacePath
}

export function setSpacePath(path: string): void {
  const state = ensure()
  state.spacePath = path
  persist()
}

export function getActiveProjectId(): string | null {
  return ensure().activeProjectId
}

export function setActiveProjectId(id: string | null): void {
  const state = ensure()
  state.activeProjectId = id
  persist()
}

export function getActiveCanvas(projectId: string): string | null {
  return ensure().projects[projectId]?.activeCanvas ?? null
}

export function setActiveCanvas(projectId: string, canvasName: string | null): void {
  const state = ensure()
  const slot = state.projects[projectId] ?? { activeCanvas: null, expandedMap: {}, canvasIds: {} }
  slot.activeCanvas = canvasName
  state.projects[projectId] = slot
  persist()
}

export function getCanvasExpanded(projectId: string, canvasName: string): boolean {
  return ensure().projects[projectId]?.expandedMap[canvasName] ?? true
}

export function setCanvasExpanded(
  projectId: string,
  canvasName: string,
  expanded: boolean,
): void {
  const state = ensure()
  const slot = state.projects[projectId] ?? { activeCanvas: null, expandedMap: {}, canvasIds: {} }
  slot.expandedMap[canvasName] = expanded
  state.projects[projectId] = slot
  persist()
}

export function renameCanvasInState(
  projectId: string,
  oldName: string,
  newName: string,
): void {
  const state = ensure()
  const slot = state.projects[projectId]
  if (!slot) return
  if (slot.activeCanvas === oldName) slot.activeCanvas = newName
  if (slot.expandedMap[oldName] !== undefined) {
    slot.expandedMap[newName] = slot.expandedMap[oldName]
    delete slot.expandedMap[oldName]
  }
  if (slot.canvasIds[oldName]) {
    slot.canvasIds[newName] = slot.canvasIds[oldName]
    delete slot.canvasIds[oldName]
  }
  persist()
}

export function dropCanvasFromState(projectId: string, canvasName: string): void {
  const state = ensure()
  const slot = state.projects[projectId]
  if (!slot) return
  if (slot.activeCanvas === canvasName) slot.activeCanvas = null
  delete slot.expandedMap[canvasName]
  delete slot.canvasIds[canvasName]
  persist()
}

export function dropProjectFromState(projectId: string): void {
  const state = ensure()
  delete state.projects[projectId]
  state.projectOrder = state.projectOrder.filter((id) => id !== projectId)
  if (state.activeProjectId === projectId) state.activeProjectId = SCRATCHPAD_PROJECT_ID
  persist()
}

export function getViewMode(projectId: string): WorkspaceViewMode | undefined {
  return ensure().projects[projectId]?.viewMode
}

export function setViewMode(projectId: string, mode: WorkspaceViewMode): void {
  const state = ensure()
  const slot = state.projects[projectId] ?? { activeCanvas: null, expandedMap: {}, canvasIds: {} }
  slot.viewMode = mode
  state.projects[projectId] = slot
  persist()
}

// --- Canvas id mapping (Phase 2 — UUIDs persist independently of file basenames) ---

function ensureSlot(projectId: string): SidebarStateFile['projects'][string] {
  const state = ensure()
  if (!state.projects[projectId]) {
    state.projects[projectId] = { activeCanvas: null, expandedMap: {}, canvasIds: {} }
  }
  return state.projects[projectId]
}

/** Returns the stable UUID for `(projectId, canvasName)`, minting lazily on first sight. */
export function getOrMintCanvasId(projectId: string, canvasName: string): string {
  const slot = ensureSlot(projectId)
  let id = slot.canvasIds[canvasName]
  if (!id) {
    id = `tab_${randomUUID()}`
    slot.canvasIds[canvasName] = id
    persist()
  }
  return id
}

/** Look up the UUID without minting. */
export function lookupCanvasId(projectId: string, canvasName: string): string | null {
  return ensure().projects[projectId]?.canvasIds[canvasName] ?? null
}

/** Find the (projectId, name) for a given UUID. Linear scan but lists are small. */
export function findCanvasById(
  tabId: string,
): { projectId: string; canvasName: string } | null {
  const state = ensure()
  for (const [projectId, slot] of Object.entries(state.projects)) {
    for (const [name, id] of Object.entries(slot.canvasIds)) {
      if (id === tabId) return { projectId, canvasName: name }
    }
  }
  return null
}

/** Forcibly set canvas-name → uuid mapping. Used by persistence to preserve UUIDs
 *  written by older code paths so the in-memory tab id and the persisted id stay in sync. */
export function setCanvasId(projectId: string, canvasName: string, id: string): void {
  const slot = ensureSlot(projectId)
  if (slot.canvasIds[canvasName] === id) return
  slot.canvasIds[canvasName] = id
  persist()
}

/** Telescope-driven rename: id stays stable, key moves. */
export function renameCanvasId(
  projectId: string,
  oldName: string,
  newName: string,
): void {
  const slot = ensureSlot(projectId)
  const id = slot.canvasIds[oldName]
  if (!id) return
  slot.canvasIds[newName] = id
  delete slot.canvasIds[oldName]
  persist()
}

/** Drop orphaned canvas-id entries whose canvas no longer exists on disk. */
export function pruneCanvasIds(projectId: string, validNames: readonly string[]): void {
  const slot = ensure().projects[projectId]
  if (!slot) return
  const valid = new Set(validNames)
  let changed = false
  for (const name of Object.keys(slot.canvasIds)) {
    if (!valid.has(name)) {
      delete slot.canvasIds[name]
      changed = true
    }
  }
  for (const name of Object.keys(slot.expandedMap)) {
    if (!valid.has(name)) {
      delete slot.expandedMap[name]
      changed = true
    }
  }
  if (slot.activeCanvas && !valid.has(slot.activeCanvas)) {
    slot.activeCanvas = null
    changed = true
  }
  if (changed) persist()
}

/** For tests + first-launch migration. */
export function __replaceState(next: SidebarStateFile): void {
  cache = next
  persist()
}

export function __resetForTests(): void {
  userDataDir = null
  cache = null
}
