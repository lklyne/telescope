import { randomUUID } from 'crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import type {
  Annotation,
  BrowserTabMode,
  DevtoolsPanelTab,
  LegacyPersistedWorkspaceStore,
  PersistedCanvasEntity,
  PersistedFrameEntity,
  PersistedWorkspaceRecord,
  PersistedWorkspaceStore,
  PersistedWorkspaceTab,
  WorkspaceEdge,
  WorkspaceFrameSource,
  WorkspaceGroup,
  WorkspacePageSnapshot,
  WorkspaceSnapshot,
  WorkspaceTabSummary,
  WorkspaceViewMode,
} from '../../shared/types'
import {
  cloneAnnotationsForPersistence,
  cloneWorkspaceSnapshot,
  frameDisplayLabel,
  normalizePresetIndex,
  viewportPresetForIndex,
} from './runtime-serialization'
import { frameCustomSizeFromMetadata } from './runtime-entities'

const WORKSPACE_STORE_FILE = 'workspace-store.json'
export const WORKSPACE_STORE_VERSION = 2 as const
export const DEFAULT_WORKSPACE_ID = 'default'
export const DEFAULT_WORKSPACE_NAME = 'Current Workspace'
export const DEFAULT_TAB_NAME = 'Canvas 1'
export const AUTOSAVE_DEBOUNCE_MS = 350

type PersistablePageSnapshotInput = {
  id: string
  name?: string
  title?: string
  url: string
  presetIndex: number
  canvasX: number
  canvasY: number
  linked: boolean
  source?: WorkspaceFrameSource
  parentGroupId?: string
  groupId?: string
  metadata?: Record<string, unknown>
}

type AutosaveSchedulerOptions = {
  autosaveTimer: NodeJS.Timeout | null
  shouldPersist: () => boolean
  setAutosaveTimer: (timer: NodeJS.Timeout | null) => void
  saveWorkspaceStore: () => void
}

export function workspaceStorePath(userDataPath: string): string {
  return join(userDataPath, WORKSPACE_STORE_FILE)
}

export function makeWorkspaceTabId(): string {
  return `tab_${randomUUID()}`
}

export function buildWorkspaceTabSummary(
  tab: PersistedWorkspaceTab,
  activeWorkspaceTabId: string | null,
): WorkspaceTabSummary {
  return {
    id: tab.id,
    name: tab.name,
    expanded: tab.expanded ?? true,
    isActive: tab.id === activeWorkspaceTabId,
    projectId: tab.projectId ?? SCRATCHPAD_PROJECT_ID,
    frameCount: tab.snapshot.pages.length,
    frames: tab.snapshot.pages.map((page) => {
      const preset = viewportPresetForIndex(page.presetIndex)
      const customSize = frameCustomSizeFromMetadata(page.metadata)
      return {
        id: page.id ?? '',
        label: frameDisplayLabel(page),
        name: page.name?.trim() || undefined,
        url: page.url,
        presetIndex: normalizePresetIndex(page.presetIndex),
        faviconUrl: null,
        width: customSize?.width ?? preset?.width,
        height: customSize?.height ?? preset?.height,
      }
    }),
  }
}

export function buildPersistedWorkspaceRecord(params: {
  workspaceTabs: PersistedWorkspaceTab[]
  activeWorkspaceTabId: string
  viewMode: WorkspaceViewMode
}): PersistedWorkspaceRecord {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: DEFAULT_WORKSPACE_NAME,
    updatedAt: new Date().toISOString(),
    activeTabId: params.activeWorkspaceTabId,
    viewMode: params.viewMode,
    tabs: params.workspaceTabs.map((tab) => ({
      ...tab,
      expanded: tab.expanded ?? true,
      snapshot: cloneWorkspaceSnapshot(tab.snapshot),
      annotations: cloneAnnotationsForPersistence(tab.annotations),
    })),
  }
}

export function buildWorkspaceStore(
  record: PersistedWorkspaceRecord,
): PersistedWorkspaceStore {
  return {
    version: WORKSPACE_STORE_VERSION,
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    workspaces: [record],
  }
}

export function writeWorkspaceStoreSync(
  file: string,
  store: PersistedWorkspaceStore,
): void {
  const tmpFile = `${file}.tmp`
  writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmpFile, file)
}

export function loadWorkspaceStore(file: string): PersistedWorkspaceStore | null {
  if (!existsSync(file)) return null
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as
    | PersistedWorkspaceStore
    | LegacyPersistedWorkspaceStore
  if (parsed.version === WORKSPACE_STORE_VERSION) {
    if (!Array.isArray(parsed.workspaces) || !parsed.workspaces.length) {
      return null
    }
    return parsed
  }
  if (parsed.version === 1) {
    return migrateLegacyWorkspaceStore(parsed)
  }
  console.warn(
    `Ignoring workspace store with unsupported version: ${String(
      (parsed as { version?: number }).version,
    )}`,
  )
  return null
}

export function migrateLegacyWorkspaceStore(
  legacy: LegacyPersistedWorkspaceStore,
): PersistedWorkspaceStore {
  return {
    version: WORKSPACE_STORE_VERSION,
    activeWorkspaceId: legacy.activeWorkspaceId,
    workspaces: legacy.workspaces.map((workspace) => {
      const tabId = makeWorkspaceTabId()
      return {
        id: workspace.id,
        name: workspace.name,
        updatedAt: workspace.updatedAt,
        activeTabId: tabId,
        tabs: [
          {
            id: tabId,
            name: DEFAULT_TAB_NAME,
            updatedAt: workspace.updatedAt,
            snapshot: cloneWorkspaceSnapshot(workspace.snapshot),
            annotations: cloneAnnotationsForPersistence(workspace.annotations),
            expanded: true,
          },
        ],
      }
    }),
  }
}

export function activePersistedWorkspace(
  store: PersistedWorkspaceStore,
): PersistedWorkspaceRecord | null {
  const byId = store.workspaces.find(
    (workspace) => workspace.id === store.activeWorkspaceId,
  )
  return byId ?? store.workspaces[0] ?? null
}

export function clonePersistedWorkspaceTabs(
  tabs: PersistedWorkspaceTab[],
): PersistedWorkspaceTab[] {
  return tabs.map((tab) => ({
    ...tab,
    snapshot: cloneWorkspaceSnapshot(tab.snapshot),
    annotations: cloneAnnotationsForPersistence(tab.annotations),
    expanded: tab.expanded ?? true,
  }))
}

export function makeEmptyWorkspaceSnapshot(params: {
  leftSidebarOpen: boolean
  devtoolsPanelTab: DevtoolsPanelTab
  devtoolsWidth: number
}): WorkspaceSnapshot {
  return {
    zoom: 1,
    pan: { x: 0, y: 0 },
    pages: [],
    entities: {},
    entityOrder: [],
    selectedPageIndex: null,
    selectedFrameIds: [],
    selectedFrameId: null,
    selectedGroupId: null,
    leftSidebarOpen: params.leftSidebarOpen,
    devtoolsOpen: false,
    devtoolsPanelTab: params.devtoolsPanelTab,
    devtoolsWidth: params.devtoolsWidth,
    browserTabMode: 'frame',
    groups: [],
    edges: [],
  }
}

export function buildPageSnapshot(
  page: PersistablePageSnapshotInput,
): WorkspacePageSnapshot {
  return {
    id: page.id,
    name: page.name?.trim() || undefined,
    url: page.url,
    presetIndex: page.presetIndex,
    canvasX: page.canvasX,
    canvasY: page.canvasY,
    linked: page.linked,
    source: page.source,
    parentGroupId: page.parentGroupId ?? page.groupId,
    groupId: page.parentGroupId ?? page.groupId,
    metadata: page.metadata,
  }
}

// --- Entity <-> Page Conversion ---

export function pageSnapshotToEntity(page: WorkspacePageSnapshot): PersistedFrameEntity {
  return {
    kind: 'frame',
    id: page.id ?? '',
    name: page.name,
    url: page.url,
    presetIndex: page.presetIndex,
    canvasX: page.canvasX,
    canvasY: page.canvasY,
    linked: page.linked,
    source: page.source,
    parentGroupId: page.parentGroupId ?? page.groupId,
    groupId: page.parentGroupId ?? page.groupId,
    metadata: page.metadata,
  }
}

export function entityToPageSnapshot(entity: PersistedCanvasEntity): WorkspacePageSnapshot | null {
  if (entity.kind !== 'frame') return null
  return {
    id: entity.id,
    name: entity.name,
    url: entity.url,
    presetIndex: entity.presetIndex,
    canvasX: entity.canvasX,
    canvasY: entity.canvasY,
    linked: entity.linked,
    source: entity.source,
    parentGroupId: entity.parentGroupId ?? entity.groupId,
    groupId: entity.parentGroupId ?? entity.groupId,
    metadata: entity.metadata,
  }
}

export function buildEntitiesFromPages(
  pages: WorkspacePageSnapshot[],
): { entities: Record<string, PersistedCanvasEntity>; entityOrder: string[] } {
  const entities: Record<string, PersistedCanvasEntity> = {}
  const entityOrder: string[] = []
  for (const page of pages) {
    const entity = pageSnapshotToEntity(page)
    if (entity.id) {
      entities[entity.id] = entity
      entityOrder.push(entity.id)
    }
  }
  return { entities, entityOrder }
}

export function buildPagesFromEntities(
  entities: Record<string, PersistedCanvasEntity>,
  entityOrder?: string[],
): WorkspacePageSnapshot[] {
  const orderedIds = entityOrder ?? Object.keys(entities)
  const pages: WorkspacePageSnapshot[] = []
  for (const id of orderedIds) {
    const entity = entities[id]
    if (!entity) continue
    const page = entityToPageSnapshot(entity)
    if (page) pages.push(page)
  }
  return pages
}

export function cloneWorkspaceGroupsForSnapshot(
  groups: WorkspaceGroup[],
): WorkspaceGroup[] {
  return groups.map((group) => ({
    ...group,
    frameIds: group.frameIds ? [...group.frameIds] : undefined,
    entityIds: group.entityIds ? [...group.entityIds] : undefined,
    metadata: group.metadata ? { ...group.metadata } : undefined,
  }))
}

export function cloneWorkspaceEdgesForSnapshot(
  edges: WorkspaceEdge[],
): WorkspaceEdge[] {
  return edges.map((edge) => ({
    ...edge,
    metadata: edge.metadata ? { ...edge.metadata } : undefined,
  }))
}

export function buildWorkspaceSnapshot(params: {
  zoom: number
  pan: { x: number; y: number }
  pages: WorkspacePageSnapshot[]
  selectedPageIndex: number | null
  selectedFrameId: string | null
  selectedFrameIds: string[]
  selectedGroupId: string | null
  leftSidebarOpen: boolean
  devtoolsOpen: boolean
  devtoolsPanelTab: DevtoolsPanelTab
  devtoolsWidth: number
  browserTabMode: BrowserTabMode
  groups: WorkspaceGroup[]
  edges: WorkspaceEdge[]
}): WorkspaceSnapshot {
  const { entities, entityOrder } = buildEntitiesFromPages(params.pages)
  return {
    zoom: params.zoom,
    pan: params.pan,
    pages: params.pages,
    entities,
    entityOrder,
    selectedPageIndex: params.selectedPageIndex,
    selectedFrameId: params.selectedFrameId,
    selectedFrameIds: params.selectedFrameIds,
    selectedGroupId: params.selectedGroupId,
    leftSidebarOpen: params.leftSidebarOpen,
    devtoolsOpen: params.devtoolsOpen,
    devtoolsPanelTab: params.devtoolsPanelTab,
    devtoolsWidth: params.devtoolsWidth,
    browserTabMode: params.browserTabMode,
    groups: cloneWorkspaceGroupsForSnapshot(params.groups),
    edges: cloneWorkspaceEdgesForSnapshot(params.edges),
  }
}

export function scheduleWorkspaceAutosave(options: AutosaveSchedulerOptions): void {
  if (!options.shouldPersist()) return
  if (options.autosaveTimer) clearTimeout(options.autosaveTimer)
  options.setAutosaveTimer(
    setTimeout(() => {
      options.setAutosaveTimer(null)
      options.saveWorkspaceStore()
    }, AUTOSAVE_DEBOUNCE_MS),
  )
}

export function flushWorkspaceAutosaveSync(options: {
  autosaveTimer: NodeJS.Timeout | null
  setAutosaveTimer: (timer: NodeJS.Timeout | null) => void
  saveWorkspaceStore: () => void
}): void {
  if (options.autosaveTimer) {
    clearTimeout(options.autosaveTimer)
    options.setAutosaveTimer(null)
  }
  options.saveWorkspaceStore()
}

// --- JSON Canvas File I/O ---

import {
  serializeToJsonCanvas,
  deserializeFromJsonCanvas,
} from './json-canvas-serializer'
import type { JsonCanvasDocument } from '../../shared/json-canvas-types'
import { canvasFilePathFor, canvasFolderFor, listCanvasFiles } from './space-manager'
import {
  SCRATCHPAD_PROJECT_ID,
  getOrMintCanvasId,
  getActiveCanvas,
  getActiveProjectId,
  getCanvasExpanded,
  getViewMode,
  lookupCanvasId,
  setActiveCanvas,
  setActiveProjectId,
  setCanvasExpanded,
  setCanvasId as setCanvasIdHelper,
  setViewMode,
  pruneCanvasIds,
  getSpacePath,
} from './sidebar-state'
import { listProjects } from './dev-server-manager'

/** Legacy on-disk root for the migration step. */
const LEGACY_WORKSPACES_DIR = 'workspaces'

export function workspacesDir(userDataPath: string): string {
  return join(userDataPath, LEGACY_WORKSPACES_DIR)
}

function legacyWorkspaceDir(userDataPath: string, workspaceId: string): string {
  return join(userDataPath, LEGACY_WORKSPACES_DIR, workspaceId)
}

function sanitizeTabName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_').trim() || 'Untitled'
}

/** Maps a (legacy) workspaceId to its project id. The single legacy workspace 'default'
 *  becomes the Scratchpad pseudo-project. Anything else passes through unchanged. */
function projectIdForWorkspaceId(workspaceId: string): string {
  return workspaceId === DEFAULT_WORKSPACE_ID ? SCRATCHPAD_PROJECT_ID : workspaceId
}

export function canvasFilePath(
  _userDataPath: string,
  workspaceId: string,
  tabName: string,
): string {
  return canvasFilePathFor(
    projectIdForWorkspaceId(workspaceId),
    sanitizeTabName(tabName),
  )
}

export function writeCanvasFileSync(
  filePath: string,
  doc: JsonCanvasDocument,
): void {
  const tmpFile = `${filePath}.tmp`
  writeFileSync(tmpFile, JSON.stringify(doc, null, 2), 'utf8')
  renameSync(tmpFile, filePath)
}

export function readCanvasFile(filePath: string): JsonCanvasDocument | null {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as JsonCanvasDocument
  } catch {
    return null
  }
}

export function writeTabAsCanvasFile(
  _userDataPath: string,
  workspaceId: string,
  tab: PersistedWorkspaceTab,
): void {
  const projectId = tab.projectId ?? projectIdForWorkspaceId(workspaceId)
  const folder = canvasFolderFor(projectId)
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true })
  const filePath = canvasFilePathFor(projectId, sanitizeTabName(tab.name))
  const doc = serializeToJsonCanvas(tab.snapshot, tab.annotations)
  writeCanvasFileSync(filePath, doc)
  // Keep the persisted canvas id in sync with the in-memory tab id.
  setCanvasIdHelper(projectId, sanitizeTabName(tab.name), tab.id)
}

export function writeAllTabsAsCanvasFiles(
  userDataPath: string,
  workspaceId: string,
  tabs: PersistedWorkspaceTab[],
): void {
  for (const tab of tabs) {
    writeTabAsCanvasFile(userDataPath, workspaceId, tab)
  }
}

/**
 * Writes per-tab UI state into userData/sidebar-state.json. The on-disk space is left
 * pristine — no workspace-meta.json files are produced.
 */
export function writeWorkspaceMetaSync(
  _userDataPath: string,
  _workspaceId: string,
  meta: {
    activeTabId: string
    viewMode?: string
    tabs: Array<{ id: string; name: string; updatedAt: string; expanded?: boolean; projectId?: string }>
  },
): void {
  let activeProjectId: string | null = null
  let activeCanvasName: string | null = null
  for (const tab of meta.tabs) {
    const projectId = tab.projectId ?? SCRATCHPAD_PROJECT_ID
    const sanitized = sanitizeTabName(tab.name)
    setCanvasIdHelper(projectId, sanitized, tab.id)
    setCanvasExpanded(projectId, sanitized, tab.expanded ?? true)
    if (meta.viewMode) setViewMode(projectId, meta.viewMode as WorkspaceViewMode)
    if (tab.id === meta.activeTabId) {
      activeProjectId = projectId
      activeCanvasName = sanitized
    }
  }
  if (activeProjectId && activeCanvasName) {
    setActiveCanvas(activeProjectId, activeCanvasName)
    setActiveProjectId(activeProjectId)
  }
}

/**
 * Reconstructs the legacy meta shape from sidebar-state.json. Returned for callers
 * that haven't been migrated to the sectioned API yet.
 */
export function readWorkspaceMeta(
  _userDataPath: string,
  _workspaceId: string,
): { activeTabId: string; viewMode?: string; tabs: Array<{ id: string; name: string; updatedAt: string; expanded?: boolean; projectId?: string }> } | null {
  const tabs: Array<{ id: string; name: string; updatedAt: string; expanded?: boolean; projectId?: string }> = []
  let activeTabId: string | null = null
  let viewMode: string | undefined

  // Walk Scratchpad + every connected project.
  const sectionIds = [SCRATCHPAD_PROJECT_ID, ...listProjects().map((p) => p.id)]
  const activeProjectId = getActiveProjectId() ?? SCRATCHPAD_PROJECT_ID

  for (const projectId of sectionIds) {
    const files = listCanvasFiles(projectId)
    for (const file of files) {
      const id = getOrMintCanvasId(projectId, file.name)
      tabs.push({
        id,
        name: file.name,
        updatedAt: new Date(file.updatedAt).toISOString(),
        expanded: getCanvasExpanded(projectId, file.name),
        projectId,
      })
    }
    if (projectId === activeProjectId) {
      const activeName = getActiveCanvas(projectId)
      if (activeName) {
        const id = lookupCanvasId(projectId, activeName)
        if (id) activeTabId = id
        viewMode = getViewMode(projectId) as string | undefined
      }
    }
    pruneCanvasIds(projectId, files.map((f) => f.name))
  }

  if (!tabs.length) return null
  if (!activeTabId) activeTabId = tabs[0].id
  return { activeTabId, viewMode, tabs }
}

/**
 * One-shot migration for Phase B (Q9): moves legacy `<userData>/workspaces/default/*.canvas`
 * files into the user's space folder, seeding sidebar-state.json so canvas UUIDs and
 * active-tab state survive. Idempotent — runs only when the legacy directory has files
 * AND the space is empty.
 *
 * Disposable: delete in the next release after Phase B ships.
 */
export function migrateLegacyWorkspaceToSpace(userDataPath: string): {
  ran: boolean
  movedCount: number
} {
  const legacyDir = legacyWorkspaceDir(userDataPath, DEFAULT_WORKSPACE_ID)
  if (!existsSync(legacyDir)) return { ran: false, movedCount: 0 }
  const legacyFiles = readdirSync(legacyDir).filter((f) => f.endsWith('.canvas'))
  if (!legacyFiles.length) return { ran: false, movedCount: 0 }

  const space = getSpacePath()
  if (!existsSync(space)) mkdirSync(space, { recursive: true })

  // Refuse if the destination already has canvas files (preserves user-edited spaces).
  const occupied = readdirSync(space).some((f) => f.endsWith('.canvas'))
  if (occupied) return { ran: false, movedCount: 0 }

  // Read legacy meta first (it's about to disappear).
  const legacyMetaPath = join(legacyDir, 'workspace-meta.json')
  let legacyMeta:
    | {
        activeTabId: string
        viewMode?: string
        tabs: Array<{ id: string; name: string; updatedAt: string; expanded?: boolean }>
      }
    | null = null
  if (existsSync(legacyMetaPath)) {
    try {
      legacyMeta = JSON.parse(readFileSync(legacyMetaPath, 'utf8'))
    } catch {
      legacyMeta = null
    }
  }

  // Copy canvas files (copy, not move — leave originals so the user can verify).
  let movedCount = 0
  for (const fileName of legacyFiles) {
    const src = join(legacyDir, fileName)
    const dst = join(space, fileName)
    if (existsSync(dst)) continue
    try {
      copyFileSync(src, dst)
      movedCount++
    } catch {
      // skip individual file failures; continue migrating the rest
    }
  }

  // Seed sidebar-state for Scratchpad.
  if (legacyMeta) {
    for (const tab of legacyMeta.tabs) {
      const sanitized = sanitizeTabName(tab.name)
      setCanvasIdHelper(SCRATCHPAD_PROJECT_ID, sanitized, tab.id)
      setCanvasExpanded(SCRATCHPAD_PROJECT_ID, sanitized, tab.expanded ?? true)
      if (tab.id === legacyMeta.activeTabId) {
        setActiveCanvas(SCRATCHPAD_PROJECT_ID, sanitized)
      }
    }
    setActiveProjectId(SCRATCHPAD_PROJECT_ID)
    if (legacyMeta.viewMode) {
      setViewMode(SCRATCHPAD_PROJECT_ID, legacyMeta.viewMode as WorkspaceViewMode)
    }
  }

  // Park the legacy dir under a `.migrated` suffix so the user can verify but it's no
  // longer found by `existsSync(legacyDir)` on the next launch.
  try {
    const parked = `${legacyDir}.migrated`
    if (!existsSync(parked)) renameSync(legacyDir, parked)
  } catch {
    // ignore — leaving the originals in place is acceptable
  }

  return { ran: true, movedCount }
}

/**
 * Migrate an existing workspace-store.json to .canvas files.
 * Called once on first launch with the new format.
 */
export function migrateWorkspaceStoreToCanvasFiles(
  userDataPath: string,
  store: PersistedWorkspaceStore,
): void {
  for (const workspace of store.workspaces) {
    // Write each tab as a .canvas file
    writeAllTabsAsCanvasFiles(userDataPath, workspace.id, workspace.tabs)

    // Write workspace metadata
    writeWorkspaceMetaSync(userDataPath, workspace.id, {
      activeTabId: workspace.activeTabId,
      viewMode: workspace.viewMode,
      tabs: workspace.tabs.map((t) => ({
        id: t.id,
        name: t.name,
        updatedAt: t.updatedAt,
        expanded: t.expanded,
      })),
    })
  }
}

// --- Load workspace from .canvas files ---

/**
 * Load a workspace from individual .canvas files + workspace-meta.json.
 * This is the primary load path — .canvas files are the source of truth.
 */
export function loadWorkspaceFromCanvasFiles(
  userDataPath: string,
  workspaceId: string,
): PersistedWorkspaceRecord | null {
  const meta = readWorkspaceMeta(userDataPath, workspaceId)
  if (!meta || !meta.tabs.length) return null

  const tabs: PersistedWorkspaceTab[] = []
  for (const tabMeta of meta.tabs) {
    const projectId = tabMeta.projectId ?? SCRATCHPAD_PROJECT_ID
    const filePath = canvasFilePathFor(projectId, sanitizeTabName(tabMeta.name))
    const doc = readCanvasFile(filePath)
    if (!doc) continue
    const { snapshot, annotations } = deserializeFromJsonCanvas(doc)
    // Populate legacy pages array from entities for backward compat
    snapshot.pages = buildPagesFromEntities(snapshot.entities ?? {}, snapshot.entityOrder)
    tabs.push({
      id: tabMeta.id,
      name: tabMeta.name,
      updatedAt: tabMeta.updatedAt,
      expanded: tabMeta.expanded ?? true,
      projectId,
      snapshot,
      annotations,
    })
  }

  if (!tabs.length) return null

  return {
    id: workspaceId,
    name: DEFAULT_WORKSPACE_NAME,
    updatedAt: new Date().toISOString(),
    activeTabId: meta.activeTabId,
    viewMode: meta.viewMode as WorkspaceViewMode | undefined,
    tabs,
  }
}

/**
 * Delete a .canvas file for a tab. Used when renaming or deleting tabs.
 */
export function deleteCanvasFile(
  _userDataPath: string,
  workspaceId: string,
  tabName: string,
): void {
  const projectId = projectIdForWorkspaceId(workspaceId)
  const filePath = canvasFilePathFor(projectId, sanitizeTabName(tabName))
  try {
    if (existsSync(filePath)) unlinkSync(filePath)
  } catch {
    // Ignore — file may already be gone
  }
}

/**
 * Like {@link deleteCanvasFile} but takes a tab object so it can route to the right
 * project folder using `tab.projectId`. Prefer this in new code.
 */
export function deleteTabCanvasFile(tab: PersistedWorkspaceTab): void {
  const projectId = tab.projectId ?? SCRATCHPAD_PROJECT_ID
  const filePath = canvasFilePathFor(projectId, sanitizeTabName(tab.name))
  try {
    if (existsSync(filePath)) unlinkSync(filePath)
  } catch {
    // Ignore — file may already be gone
  }
}
