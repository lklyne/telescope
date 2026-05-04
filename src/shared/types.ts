import type {
  CursorMotionParams,
  CurveDirection,
  EasingPreset,
  EasingSpec,
  MotionCandidate,
  Vec2,
} from './cursor-motion'
import type { CursorTuningParams } from './cursor-tuning'
import type { PresenceDebugEntry } from './presence-debug'

// --- IPC Channel Types ---

export type RepoStatus = 'stopped' | 'starting' | 'running' | 'errored'

export interface ConnectedRepo {
  id: string
  absolutePath: string
  label: string
  status: RepoStatus
  port: number | null
  baseUrl: string | null
  lastError?: string
}

export interface ViewportPreset {
  label: string
  width: number
  height: number
  mobile: boolean
}

export interface PageConfig {
  id?: string
  name?: string
  url: string
  presetIndex: number
  canvasX: number
  canvasY: number
  linked?: boolean
  suppressInitialNavigationBroadcast?: boolean
  source?: WorkspaceFrameSource
  parentGroupId?: string
  groupId?: string
  metadata?: Record<string, unknown>
}

// --- Generic Canvas Entity Types ---

export type CanvasEntityKind = 'frame' | 'text' | 'file' | 'group' | 'edge' | 'drawing' | 'shape'

export type ShapeKind = 'rectangle' | 'ellipse' | 'diamond'

export interface CanvasEntityRef {
  kind: CanvasEntityKind
  id: string
}

export type CanvasSelectableTarget = CanvasEntityRef

export type CanvasHoverTarget = CanvasSelectableTarget | null

export type SelectionModifiers = {
  shift: boolean
  meta: boolean
  ctrl: boolean
}

export type CanvasInteractionState =
  | { kind: 'idle' }
  | {
      kind: 'dragging-edge'
      from: CanvasSelectableTarget
      fromSide: EdgeSide
      target: CanvasSelectableTarget | null
      targetSide: EdgeSide | null
    }
  | { kind: 'dragging-entities'; entityIds: string[] }
  | { kind: 'marquee-select' }
  | { kind: 'panning-canvas' }
  | { kind: 'resizing-entity'; entity: CanvasSelectableTarget }
  | { kind: 'editing-text'; entityId: string }

export interface CanvasSceneFrameEntity {
  kind: 'frame'
  id: string
  label: string
  faviconUrl?: string | null
  url: string
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
  isCustomSize: boolean
  browserSizeMode: 'fill' | 'device'
  canvasX: number
  canvasY: number
  width: number
  height: number
  presetIndex: number
  linked: boolean
  /** Outer screen bounds (includes shell when device frame is on). */
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
  /** Device frame state. */
  deviceId?: string | null
  deviceOrientation?: 'portrait' | 'landscape'
  showDeviceFrame?: boolean
  /** Inner content screen bounds (always the web viewport). */
  contentScreenX?: number
  contentScreenY?: number
  contentScreenWidth?: number
  contentScreenHeight?: number
  /** Use SVG rendering for the device shell (A/B toggle). */
  useSvgDeviceShell?: boolean
}

export interface CanvasSceneTextEntity {
  kind: 'text'
  id: string
  text: string
  color: string
  canvasX: number
  canvasY: number
  width: number
  height: number
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
  parentGroupId?: string
}

export interface CanvasSceneFileEntity {
  kind: 'file'
  id: string
  file: string
  subpath?: string
  canvasX: number
  canvasY: number
  width: number
  height: number
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
  parentGroupId?: string
  objectFit?: FileObjectFit
  /** Renderer-side dispatch tag chosen by the entity-renderer registry. */
  rendererTag?: 'image' | 'video' | 'markdown' | 'wireframe' | 'component'
  /**
   * For component file entities: whether some connected repo claims this
   * file (i.e. resolveUrl will succeed). The renderer suppresses the
   * placeholder when true so the WCV shows through cleanly without a
   * faded "Connect a Vite repo" copy bleeding behind transparent content.
   */
  componentHasRepo?: boolean
  /**
   * For component file entities without a connected repo: the nearest
   * ancestor folder that contains a package.json. Surfaced so the
   * placeholder can offer one-click reconnect without prompting the user
   * to re-pick the folder.
   */
  componentInferredRepoPath?: string
  /** Device frame state. */
  deviceId?: string | null
  deviceOrientation?: 'portrait' | 'landscape'
  showDeviceFrame?: boolean
  /** Inner content screen bounds (when device frame is on). */
  contentScreenX?: number
  contentScreenY?: number
  contentScreenWidth?: number
  contentScreenHeight?: number
}

export interface CanvasSceneGroupEntity {
  kind: 'group'
  id: string
  label: string
  color?: string
  canvasX: number
  canvasY: number
  width: number
  height: number
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
  parentGroupId?: string
  groupKind: WorkspaceGroupKind
  layoutMode: WorkspaceGroupLayoutMode
  managedLayout: boolean
  entityIds: string[]
}

export interface CanvasSceneDrawingEntity {
  kind: 'drawing'
  id: string
  canvasX: number
  canvasY: number
  width: number
  height: number
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
  strokes: AnnotationDrawingStroke[]
  parentGroupId?: string
}

export interface CanvasSceneShapeEntity {
  kind: 'shape'
  id: string
  shapeKind: ShapeKind
  text: string
  color?: string
  strokeWidth?: number
  theme?: string
  canvasX: number
  canvasY: number
  width: number
  height: number
  parentGroupId?: string
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
}

export type CanvasSceneEntity =
  | CanvasSceneFrameEntity
  | CanvasSceneTextEntity
  | CanvasSceneFileEntity
  | CanvasSceneGroupEntity
  | CanvasSceneDrawingEntity
  | CanvasSceneShapeEntity

export interface ActiveCanvasEntitySelection {
  entityRef: CanvasEntityRef
  label: string
  width: number
  height: number
  presetIndex: number
  linked: boolean
}

export interface PendingPlacement {
  entityKind: CanvasEntityKind
  presetIndex?: number
  shapeKind?: ShapeKind
  width: number
  height: number
  initialClientX: number | null
  initialClientY: number | null
}

// --- Persisted Entity Types ---

export interface CanvasEntityBase {
  id: string
  kind: CanvasEntityKind
  canvasX: number
  canvasY: number
  parentGroupId?: string
}

export interface PersistedFrameEntity extends CanvasEntityBase {
  kind: 'frame'
  name?: string
  url: string
  presetIndex: number
  linked: boolean
  source?: WorkspaceFrameSource
  groupId?: string
  metadata?: Record<string, unknown>
}

export interface PersistedTextEntity extends CanvasEntityBase {
  kind: 'text'
  text: string
  color: string
  width: number
  height: number
  label?: string
}

export type FileObjectFit = 'contain' | 'cover' | 'fill'

export interface PersistedFileEntity extends CanvasEntityBase {
  kind: 'file'
  file: string
  subpath?: string
  width: number
  height: number
  objectFit?: FileObjectFit
  presetIndex?: number
  metadata?: Record<string, unknown>
}

export type WorkspaceGroupKind = 'manual' | 'breakpoint_cluster' | 'component_states'
export type WorkspaceGroupLayoutMode = 'freeform' | 'row' | 'grid'

export interface PersistedGroupEntity extends CanvasEntityBase {
  kind: 'group'
  label: string
  color?: string
  width: number
  height: number
  groupKind: WorkspaceGroupKind
  layoutMode: WorkspaceGroupLayoutMode
  managedLayout: boolean
  sourceTaskId?: string
  metadata?: Record<string, unknown>
}

export interface PersistedDrawingEntity extends CanvasEntityBase {
  kind: 'drawing'
  width: number
  height: number
  strokes: AnnotationDrawingStroke[]
  label?: string
}

export interface PersistedShapeEntity extends CanvasEntityBase {
  kind: 'shape'
  shapeKind: ShapeKind
  text: string
  color?: string
  strokeWidth?: number
  theme?: string
  width: number
  height: number
  label?: string
}

export type PersistedCanvasEntity =
  | PersistedFrameEntity
  | PersistedTextEntity
  | PersistedFileEntity
  | PersistedGroupEntity
  | PersistedDrawingEntity
  | PersistedShapeEntity

// --- Layout Update Data ---

export interface LayoutUpdateData {
  zoom: number
  pan: { x: number; y: number }
  canvasOrigin: { x: number; y: number }
  /**
   * Width of left-edge chrome (sidebar) currently covering the canvas. 0 when
   * the sidebar is closed. The canvas coordinate system is not shifted by the
   * sidebar; surfaces that need to avoid occluded pixels (clipping, viewport
   * centering, tab-bar insets) read this instead of canvasOrigin.x.
   */
  leftChromeWidth: number
  entities: CanvasSceneEntity[]
  browserTabs: WorkspaceTabFrameSummary[]
  browserFillViewport: {
    width: number
    height: number
  }
  selectedEntityIds: string[]
  selection: CanvasSelectableTarget[]
  activeSelection: ActiveCanvasEntitySelection | null
  annotationMode: AnnotationMode
  annotations: Annotation[]
  fixProgress: Record<string, FixProgressEntry>
  viewMode: WorkspaceViewMode
  activeBrowserTabId: string | null
  activeBrowserFrameId: string | null
  selectedGroupId?: string | null
  hover: CanvasHoverTarget
  interaction: CanvasInteractionState
  pendingPlacement: PendingPlacement | null
  devtoolsOpen: boolean
  devtoolsWidth: number
  edges: WorkspaceEdge[]
  groups?: CanvasSceneGroupEntity[]
  presenceCursors: AgentPresenceCursor[]
}

export type PresenceSurface = 'canvas' | 'frame'

export type PresenceActivity = 'traveling' | 'acting' | 'waiting' | 'thinking' | 'idle' | 'departing'

export type PresenceLabelKey =
  | 'scan_workspace'
  | 'find_placement'
  | 'create_frame'
  | 'select_frame'
  | 'attach_frame'
  | 'inspect_page'
  | 'find_target'
  | 'click_target'
  | 'type_text'
  | 'select_option'
  | 'wait_page'
  | 'scroll_page'
  | 'read_content'
  | 'add_annotation'
  | 'thinking'
  | 'idle'
  | 'departing'

export interface PresenceTargetRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PresenceCoordinates {
  canvasX?: number
  canvasY?: number
  frameX?: number
  frameY?: number
  targetRect?: PresenceTargetRect | null
}

export type PresenceTargetRefSource = 'specular' | 'agent-browser'

export interface PresenceEvent {
  sessionId: string
  surface: PresenceSurface
  phase: PresenceActivity
  eventType?: 'start' | 'surface' | 'act' | 'think' | 'done' | null
  frameId?: string | null
  coordinates?: PresenceCoordinates | null
  labelKey: PresenceLabelKey | null
  taskLabel?: string | null
  labelHint?: string | null
  labelParams?: Record<string, string | number | boolean> | null
  targetRef?: string | null
  targetRefSource?: PresenceTargetRefSource | null
  targetName?: string | null
}

export interface AgentPresenceCursor {
  sessionId: string
  clientName: string
  color: string
  canvasX: number
  canvasY: number
  surface: PresenceSurface
  activity: PresenceActivity
  frameId?: string | null
  frameX?: number | null
  frameY?: number | null
  labelKey: PresenceLabelKey | null
  taskLabel?: string | null
  labelHint?: string | null
  labelParams?: Record<string, string | number | boolean> | null
  targetRef?: string | null
  targetRefSource?: PresenceTargetRefSource | null
  targetName?: string | null
  targetRect?: PresenceTargetRect | null
  updatedAt: number
}

export interface AgentSnapshotNode {
  ref: string
  parentRef?: string | null
  depth: number
  tagName: string
  role?: string
  name?: string
  text?: string
  interactive: boolean
  bounds: PresenceTargetRect
  elementPath: string
  fullPath: string
}

export interface AgentSnapshotFrame {
  frameId: string
  url: string
  title: string
  nodes: AgentSnapshotNode[]
}

export interface SidebarFrameItem {
  kind: 'frame'
  id: string
  label: string
  faviconUrl?: string | null
  width?: number
  height?: number
}

export interface SidebarTextItem {
  kind: 'text'
  id: string
  label: string
  color: string
}

export interface SidebarFileItem {
  kind: 'file'
  id: string
  label: string
  file: string
}

export interface SidebarDrawingItem {
  kind: 'drawing'
  id: string
  label: string
  strokeCount: number
}

export interface SidebarGroupItem {
  kind: 'group'
  id: string
  label: string
  entityCount: number
  children: SidebarCanvasItem[]
}

export type SidebarCanvasItem =
  | SidebarFrameItem
  | SidebarTextItem
  | SidebarFileItem
  | SidebarDrawingItem
  | SidebarGroupItem

export interface LeftSidebarData {
  width: number
  selectedEntityIds: string[]
  selectedGroupId?: string | null
  tabs: WorkspaceTabSummary[]
  activeTabId: string | null
  viewMode: WorkspaceViewMode
  hasFrames: boolean
  items: SidebarCanvasItem[]
}

export interface ChromeUpdateData {
  label: string
  width: number
  height: number
  url: string
  presetIndex: number
  selected: boolean
  linked: boolean
}

export interface ToolbarSelectionData {
  activeFrameId: string | null
  selectedEntityIds: string[]
  selectionCount: number
  availableFrameCount: number
  displayUrl: string
  placeholder: string
  canGoBack: boolean
  canGoForward: boolean
  isLoadingActiveFrame: boolean
  loadingFrameCount: number
  isLoadingAnySelected: boolean
  loadingPhase: 'idle' | 'waiting-response' | 'loading'
  activeTabId: string | null
  activeTabName: string | null
  viewMode: WorkspaceViewMode
  pendingPlacementActive: boolean
}

export type AnnotationMode = 'off' | 'comment' | 'draw' | 'region_select'

export interface ThemeData {
  isDark: boolean
}

export interface ThemeBootstrapData {
  theme: ThemeData
}

export interface DebugBootstrapData extends ThemeBootstrapData {
  cursorMotion: CursorMotionParams
  cursorSplineViz: boolean
  cursorTuning: CursorTuningParams
  presenceTimeline: PresenceDebugEntry[]
}

export interface LeftSidebarBootstrapData extends ThemeBootstrapData {
  sidebarData: LeftSidebarData
}

// --- Onboarding ---

export type OnboardingComponentId = 'cli' | 'skill' | 'agentBrowser'

export type OnboardingComponentStatus =
  | { kind: 'installed'; detail?: string }
  | { kind: 'outdated'; detail?: string }
  | { kind: 'missing'; detail?: string }
  | { kind: 'blocked'; detail: string }

export interface OnboardingStatusSnapshot {
  cli: OnboardingComponentStatus
  skill: OnboardingComponentStatus
  agentBrowser: OnboardingComponentStatus
  claudeDirExists: boolean
}

export type OnboardingMode = 'welcome' | 'settings'

export interface OnboardingBootstrapData extends ThemeBootstrapData {
  status: OnboardingStatusSnapshot
  mode: OnboardingMode
}

export type OnboardingProgressEvent =
  | { component: OnboardingComponentId; state: 'installing' }
  | { component: OnboardingComponentId; state: 'success'; detail?: string }
  | { component: OnboardingComponentId; state: 'error'; detail: string }
  | { kind: 'done'; status: OnboardingStatusSnapshot }

export interface OnboardingState {
  completed: boolean
  dismissedAt?: number
  completedAt?: number
  /** SHA-256 of each skill's content as we last installed it. Used to
   * detect whether the user has hand-edited the file before auto-updating. */
  skillHashes?: { specular?: string; 'agent-browser'?: string }
}

export interface OnboardingElectronAPI {
  getInitialData: () => Promise<OnboardingBootstrapData>
  refreshStatus: () => Promise<OnboardingStatusSnapshot>
  install: (
    selections: Record<OnboardingComponentId, boolean>,
  ) => Promise<OnboardingStatusSnapshot>
  complete: () => void
  dismiss: () => void
  onProgress: (callback: (event: OnboardingProgressEvent) => void) => () => void
  onThemeChanged: (callback: (data: ThemeData) => void) => () => void
}

export interface DebugElectronAPI {
  getInitialData: () => Promise<DebugBootstrapData>
  updateCursorMotion: (params: CursorMotionParams) => void
  resetCursorMotion: () => void
  onCursorMotionChanged: (callback: (params: CursorMotionParams) => void) => () => void
  updateCursorSplineViz: (on: boolean) => void
  onCursorSplineVizChanged: (callback: (on: boolean) => void) => () => void
  updateCursorTuning: (params: CursorTuningParams) => void
  resetCursorTuning: () => void
  onPresenceTimelineAppend: (callback: (entry: PresenceDebugEntry) => void) => () => void
  onThemeChanged: (callback: (data: ThemeData) => void) => () => void
}

export interface DebugPreviewPath {
  start: Vec2
  end: Vec2
  candidates: MotionCandidate[]
  selectedCandidateIndex: number
  samples: Vec2[]
}

export type {
  CursorMotionParams,
  CurveDirection,
  CursorTuningParams,
  EasingPreset,
  EasingSpec,
  MotionCandidate,
  PresenceDebugEntry,
  Vec2,
}

export interface CanvasLayoutBootstrapData extends ThemeBootstrapData {
  layoutData: LayoutUpdateData
}

export interface FloatingUiUpdatePayload {
  layoutData: LayoutUpdateData
  surfaceOrigin: { x: number; y: number }
}

export interface FloatingUiBootstrapData extends ThemeBootstrapData, FloatingUiUpdatePayload {}

// --- Panel mode (selection-driven) ---

export type PanelMode =
  | { kind: 'document' }
  | { kind: 'frame'; entityId: string }
  | { kind: 'text'; entityId: string }
  | { kind: 'file'; entityId: string }
  | { kind: 'drawing'; entityId: string }
  | { kind: 'shape'; entityId: string }
  | { kind: 'edge'; entityId: string }
  | { kind: 'group'; entityId: string }
  | { kind: 'multi'; entityIds: string[] }

export interface PanelShapeEntityDetail {
  id: string
  shapeKind: ShapeKind
  text: string
  color?: string
  strokeWidth?: number
  width: number
  height: number
}

export interface PanelTextEntityDetail {
  id: string
  text: string
  color: string
  width: number
  height: number
}

export type PanelFileType = 'image' | 'video' | 'markdown' | 'wireframe' | 'component' | 'other'

export interface PanelFileEntityDetail {
  id: string
  file: string
  subpath?: string
  width: number
  height: number
  objectFit?: FileObjectFit
  fileType: PanelFileType
  presetIndex?: number
  deviceId?: string | null
  deviceOrientation?: 'portrait' | 'landscape'
  showDeviceFrame?: boolean
}

export interface PanelDrawingEntityDetail {
  id: string
  width: number
  height: number
  strokeCount: number
}

export interface PanelEdgeEntityDetail {
  id: string
  fromEntityId: string
  toEntityId: string
  fromLabel: string
  toLabel: string
  fromSide?: EdgeSide
  toSide?: EdgeSide
  fromEnd?: EdgeEnd
  toEnd?: EdgeEnd
  color?: string
  label?: string
  kind: 'breakpoint_variant' | 'connection'
}

export interface PanelGroupEntityDetail {
  id: string
  label: string
  color?: string
  groupKind: WorkspaceGroupKind
  layoutMode: WorkspaceGroupLayoutMode
  entityIds: string[]
}

export interface PanelMultiEntitySummary {
  id: string
  kind: CanvasEntityKind
  label: string
}

export interface DevtoolsPanelData {
  activeTab: DevtoolsPanelTab
  panelMode: PanelMode
  annotateEnabled?: boolean
  annotateAvailable?: boolean
  focusedAnnotationId?: string | null
  selection?: DevtoolsPanelSelectionSummary
  inspect?: InspectPanelState
  annotations?: Annotation[]
  frames?: DevtoolsPanelFrameSummary[]
  originBindings?: OriginBindings
  fixInProgress?: Record<string, number>
  fixProgress?: Record<string, FixProgressEntry>
  fixConfig?: FixConfig
  textEntity?: PanelTextEntityDetail
  fileEntity?: PanelFileEntityDetail
  drawingEntity?: PanelDrawingEntityDetail
  shapeEntity?: PanelShapeEntityDetail
  edgeEntity?: PanelEdgeEntityDetail
  groupEntity?: PanelGroupEntityDetail
  multiEntities?: PanelMultiEntitySummary[]
  emptyState?: {
    kind: 'mcp_setup'
    serverName: string
    command: string
    installCommand: string
    tools: string[]
    configPath: string
    discoveryFile: string
    status: {
      healthy: boolean
      appServerRunning: boolean
      discoveryFilePresent: boolean
      mcpClientConnected: boolean
      activeClientCount: number
      lastClientSeenAt: string | null
    }
  }
}

export interface DevtoolsPanelFrameSummary {
  id: string
  label: string
  url: string
  faviconUrl?: string | null
  width?: number
  height?: number
  presetIndex: number
  deviceId?: string | null
  deviceOrientation?: 'portrait' | 'landscape'
  showDeviceFrame?: boolean
  useSvgDeviceShell?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
  isLoading?: boolean
  linked?: boolean
}

export type DevtoolsPanelTab = 'comments' | 'inspect' | 'browser-devtools' | 'settings'

export type InspectNodeSource = 'react' | 'dom' | 'dom_fallback'

export type InspectMode = 'frame_locked' | 'global_target'

export interface InspectNodeSummary {
  id: string
  parentId?: string
  frameId: string
  name: string
  source: InspectNodeSource
  dsComponentName?: string
  hasSource: boolean
  childrenIds: string[]
}

export interface InspectNodeDetail extends DevtoolsPanelDomTarget {
  nodeId: string
  frameId: string
  props?: Record<string, unknown>
  tokens?: Record<string, string>
  dsComponentName?: string
  sourceLocation?: SourceLocation
  dsVariants?: Record<string, string>
  dsPropSignature?: Array<{
    name: string
    type: 'string' | 'number' | 'boolean' | 'enum'
    values?: string[]
    defaultValue?: string
  }>
}

export interface InspectPanelState {
  available: boolean
  enabled: boolean
  mode: InspectMode
  activeFrameId: string | null
  hoveredNodeId: string | null
  selectedNodeId: string | null
  treeRootIds: string[]
  nodesById: Record<string, InspectNodeSummary>
  detailById: Record<string, InspectNodeDetail>
  diagnostics?: {
    collector:
      | 'hook'
      | 'dom_fiber'
      | 'main_world'
      | 'dom_fallback'
      | 'unknown'
    nodeCount: number
    reactNodeCount: number
    domFallbackNodeCount: number
    sourceLocationCount: number
  }
}

export interface DevtoolsPanelSelectionSummary {
  frameId: string
  url: string
  pageTitle: string
  viewportLabel: string
  width: number
  height: number
  linked: boolean
}

export interface DevtoolsPanelDomRect {
  x: number
  y: number
  width: number
  height: number
}

export interface DevtoolsPanelDomAttribute {
  name: string
  value: string
}

export interface DevtoolsPanelDomTarget {
  id: string
  frameId: string
  timestamp: number
  tagName: string
  name: string
  role?: string
  elementPath: string
  fullPath: string
  cssClasses: string[]
  textPreview?: string
  nearbyText?: string
  nearbyElements: string[]
  accessibility: string[]
  attributes: DevtoolsPanelDomAttribute[]
  computedStyles: string[]
  boundingBox?: DevtoolsPanelDomRect
  position?: {
    viewportXPercent: number
    documentY: number
    isFixed: boolean
  }
}

export interface DevtoolsPanelDomInspectorState {
  available: boolean
  inspectMode: boolean
  hoverTarget: DevtoolsPanelDomTarget | null
  selectedTarget: DevtoolsPanelDomTarget | null
}

export interface ScrollSyncData {
  xProgress: number
  yProgress: number
  viewportCenterProgress?: number
  sourceUrl: string
  anchorSelector?: string
  anchorProgress?: number
}

export interface SourceLocation {
  file: string
  line?: number
  column?: number
}

export type UiSelection =
  | { kind: 'none' }
  | { kind: 'single-entity'; entityId: string; entityKind: CanvasEntityKind }
  | {
      kind: 'multi-entity'
      entityIds: string[]
      entityKindsById: Partial<Record<string, CanvasEntityKind>>
    }

export type UiToolMode =
  | 'select'
  | 'inspect'
  | 'annotate-comment'
  | 'annotate-draw'
  | 'annotate-region-select'

export type SelectionOverlayRect = {
  left: number
  top: number
  width: number
  height: number
}

export type SelectionOverlayPayload = {
  rect: SelectionOverlayRect
  variant?: 'default' | 'region-select' | 'place-shape'
  shapeKind?: ShapeKind
}

export type UiViewMode =
  | { kind: 'canvas' }
  | { kind: 'browser'; frameId: string }

export interface UiDevtoolsState {
  open: boolean
  activeTab: DevtoolsPanelTab
  focusedAnnotationId: string | null
  width: number
}

export interface UiOverlayState {
  commentOverlayVisible: boolean
  selectionMarqueeVisible: boolean
}

export interface UiPendingPlacement {
  entityKind: CanvasEntityKind
  presetIndex?: number
  customSize?: boolean
  sourceFrameId?: string
  shapeKind?: ShapeKind
}

export interface UiState {
  selection: UiSelection
  toolMode: UiToolMode
  viewMode: UiViewMode
  leftSidebarOpen: boolean
  devtools: UiDevtoolsState
  overlays: UiOverlayState
  pendingPlacement: UiPendingPlacement | null
}

export interface ComponentTreeNode {
  id: string
  componentName: string
  dsComponentName?: string
  hasSource: boolean
  children: ComponentTreeNode[]
}

export interface ComponentNodeDetail {
  props: Record<string, unknown>
  tokens: Record<string, string>
  sourceLocation?: SourceLocation
  dsComponentName?: string
  dsVariants?: Record<string, string>
  dsPropSignature?: Array<{
    name: string
    type: 'string' | 'number' | 'boolean' | 'enum'
    values?: string[]
    defaultValue?: string
  }>
}

export interface WorkspacePageSnapshot {
  id?: string
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

export interface WorkspaceSnapshot {
  zoom: number
  pan: { x: number; y: number }
  /** @deprecated Use entities instead. Kept for backward compatibility with old snapshots. */
  pages: WorkspacePageSnapshot[]
  /** Generic entity store. When present, this is the canonical source of truth. */
  entities?: Record<string, PersistedCanvasEntity>
  /** Ordered entity IDs for z-ordering (front-to-back). */
  entityOrder?: string[]
  selectedPageIndex: number | null
  selectedFrameId?: string | null
  selectedFrameIds?: string[]
  selectedGroupId?: string | null
  leftSidebarOpen?: boolean
  devtoolsOpen: boolean
  devtoolsPanelTab?: DevtoolsPanelTab
  devtoolsWidth: number
  browserTabMode?: BrowserTabMode
  groups?: WorkspaceGroup[]
  edges?: WorkspaceEdge[]
}

export interface PersistedWorkspaceTab {
  id: string
  name: string
  updatedAt: string
  snapshot: WorkspaceSnapshot
  annotations: Annotation[]
  expanded?: boolean
}

export interface PersistedWorkspaceRecord {
  id: string
  name: string
  updatedAt: string
  activeTabId: string
  viewMode?: WorkspaceViewMode
  tabs: PersistedWorkspaceTab[]
}

export interface PersistedWorkspaceStore {
  version: 2
  activeWorkspaceId: string
  workspaces: PersistedWorkspaceRecord[]
}

export type LegacyPersistedWorkspaceRecord = {
  id: string
  name: string
  updatedAt: string
  snapshot: WorkspaceSnapshot
  annotations: Annotation[]
}

export type LegacyPersistedWorkspaceStore = {
  version: 1
  activeWorkspaceId: string
  workspaces: LegacyPersistedWorkspaceRecord[]
}

export type WorkspaceFrameSource = 'manual' | 'generated'

export interface WorkspaceFrame {
  id: string
  kind: 'frame'
  name?: string
  url: string
  presetIndex: number
  canvasX: number
  canvasY: number
  width: number
  height: number
  linkedBrowsing: boolean
  source: WorkspaceFrameSource
  parentGroupId?: string
  groupId?: string
  metadata?: Record<string, unknown>
}

export interface WorkspaceTextEntity {
  id: string
  kind: 'text'
  /** First 80 chars of the text content. Use get_text_entities for full content. */
  preview: string
  color: string
  canvasX: number
  canvasY: number
  width: number
  height: number
  parentGroupId?: string
}

export interface WorkspaceFileEntity {
  id: string
  kind: 'file'
  file: string
  subpath?: string
  canvasX: number
  canvasY: number
  width: number
  height: number
  parentGroupId?: string
}

export interface ClipboardFramePayload {
  url: string
  presetIndex: number
  dx: number
  dy: number
}

export interface ClipboardFrameSelectionPayload {
  version: 1
  frames: ClipboardFramePayload[]
}

export interface ClipboardEntityPayload {
  kind: CanvasEntityKind
  dx: number
  dy: number
  // Frame-specific
  url?: string
  presetIndex?: number
  // Frame device metadata (so paste reproduces the device shell)
  metadata?: Record<string, unknown>
  // Text entity-specific
  text?: string
  color?: string
  width?: number
  height?: number
  // File entity-specific
  file?: string
  subpath?: string
  objectFit?: FileObjectFit
}

export interface ClipboardEntitySelectionPayload {
  version: 2
  entities: ClipboardEntityPayload[]
}

export interface WorkspaceGroup {
  id: string
  kind: 'group' | 'breakpoint_cluster' | 'user'
  label: string
  canvasX: number
  canvasY: number
  width: number
  height: number
  parentGroupId?: string
  color?: string
  groupKind: WorkspaceGroupKind
  layoutMode: WorkspaceGroupLayoutMode
  managedLayout: boolean
  frameIds?: string[]
  entityIds?: string[]
  sourceTaskId?: string
  metadata?: Record<string, unknown>
}

export type WorkspaceCanvasEntity =
  | WorkspaceFrame
  | WorkspaceTextEntity
  | WorkspaceFileEntity
  | WorkspaceGroup

export type EdgeSide = 'top' | 'right' | 'bottom' | 'left'
export type EdgeEnd = 'none' | 'arrow'

export interface WorkspaceEdge {
  id: string
  fromEntityId: string
  toEntityId: string
  fromSide?: EdgeSide
  toSide?: EdgeSide
  fromEnd?: EdgeEnd
  toEnd?: EdgeEnd
  color?: string
  label?: string
  kind: 'breakpoint_variant' | 'connection'
  metadata?: Record<string, unknown>
}


export interface WorkspaceSelection {
  selectedEntityId?: string
  selectedEntityIds?: string[]
  selectedGroupId?: string
}

export interface WorkspaceBounds {
  x: number
  y: number
  width: number
  height: number
}

export type WorkspaceViewMode = 'canvas' | 'browser'
/** @deprecated Browser mode no longer has sub-modes; kept for snapshot compat */
export type BrowserTabMode = 'responsive' | 'frame'

export interface WorkspaceTabFrameSummary {
  id: string
  label: string
  name?: string
  url: string
  presetIndex: number
  faviconUrl?: string | null
  width?: number
  height?: number
}

export interface WorkspaceTabSummary {
  id: string
  name: string
  expanded: boolean
  isActive: boolean
  frameCount: number
  frames: WorkspaceTabFrameSummary[]
}

export interface WorkspaceGraph {
  entities: WorkspaceCanvasEntity[]
  edges: WorkspaceEdge[]
  selection: WorkspaceSelection
  camera: {
    zoom: number
    panX: number
    panY: number
  }
  occupiedRegions: WorkspaceBounds[]
}

export type PlacementAnchor = 'selection_or_empty_region' | 'empty_region'

export interface PlacementRequest {
  width: number
  height: number
  anchor: PlacementAnchor
}

export interface PlacementResult {
  canvasX: number
  canvasY: number
  fallbackUsed: boolean
  reason: string
}

export type BatchLayoutMode = 'row' | 'column' | 'grid'

export interface BatchPlacementRequest {
  items: Array<{ width: number; height: number }>
  layout?: BatchLayoutMode
  gap?: number
  anchor?: PlacementAnchor
}

export interface BatchPlacementResult {
  positions: Array<{ canvasX: number; canvasY: number }>
}

export type TaskKind = 'breakpoint_map'

export interface BreakpointMapTaskInput {
  url: string
  presets?: string[]
  label?: string
}

export interface ApplyTaskLayoutRequest {
  taskKind: TaskKind
  input: BreakpointMapTaskInput
  options?: {
    anchor?: PlacementAnchor
    focus?: boolean
  }
}

export interface ApplyTaskLayoutResponse {
  taskId: string
  taskKind: TaskKind
  groupId: string
  frameIds: string[]
  edgeIds: string[]
  resolvedPresets: string[]
  placement: PlacementResult
  warnings: string[]
}

export interface LayoutComponentStatesRequest {
  component: string
  url: string
  vary: string[]
  values?: Record<string, unknown[]>
  states?: string[]
  tokens?: Record<string, string>
  selector?: string
  anchor?: PlacementAnchor
  focus?: boolean
  label?: string
}

export interface LayoutComponentStatesResponse {
  taskId: string
  groupId: string
  frameIds: string[]
  placement: PlacementResult
  warnings: string[]
}

export interface DeleteFramesRequest {
  frameIds: string[]
  focusAfter?: boolean
}

export interface DeleteFramesResponse {
  deletedFrameIds: string[]
  deletedEdgeIds: string[]
  deletedGroupIds: string[]
  missingFrameIds: string[]
  warnings: string[]
}

export interface DeleteGroupsRequest {
  groupIds: string[]
  deleteMemberFrames?: boolean
  focusAfter?: boolean
}

export interface DeleteGroupsResponse {
  deletedGroupIds: string[]
  deletedFrameIds: string[]
  deletedEdgeIds: string[]
  missingGroupIds: string[]
  warnings: string[]
}

export interface CreateFramesRequest {
  frames: PageConfig[]
}

export interface CreateFramesResponse {
  frameIds: string[]
}

export interface CreateEdgesRequest {
  edges: Array<Omit<WorkspaceEdge, 'id'> & { id?: string }>
}

export interface CreateEdgesResponse {
  edgeIds: string[]
}

// --- Electron API Interfaces (exposed via contextBridge) ---

export interface ToolbarElectronAPI {
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
  zoomSet: (level: number) => void
  navigateSelection: (url: string) => void
  goBackSelection: () => void
  goForwardSelection: () => void
  reloadSelection: () => void
  addPage: (presetIndex: number | 'custom') => void
  cancelPendingPlacement: () => void
  addTextEntity: () => void
  addNote: () => void
  addShape: (shapeKind: ShapeKind) => void
  reloadApp: () => void
  toggleTheme: () => void
  getInitialData: () => Promise<ThemeBootstrapData>
  toggleLeftSidebar: () => void
  toggleDevTools: () => void
  clearToolMode: () => void
  toggleInspectMode: () => void
  toggleAnnotateMode: () => void
  toggleDrawMode: () => void
  toggleRegionSelectMode: () => void
  toggleBrowserMode: () => void
  dropdownOpen: () => void
  dropdownClose: () => void
  setTextEditing: (active: boolean) => void
  onZoomChanged: (callback: (value: number) => void) => () => void
  onSelectionChanged: (callback: (data: ToolbarSelectionData) => void) => () => void
  onLeftSidebarChanged: (callback: (open: boolean) => void) => () => void
  onDevtoolsChanged: (callback: (open: boolean) => void) => () => void
  onInspectStateChanged: (
    callback: (state: { enabled: boolean; available: boolean }) => void,
  ) => () => void
  onAnnotateStateChanged: (
    callback: (state: { enabled: boolean; available: boolean; mode: AnnotationMode }) => void,
  ) => () => void
  onThemeChanged: (callback: (data: ThemeData) => void) => () => void
  onAgentPresenceChanged: (callback: (cursors: AgentPresenceCursor[]) => void) => () => void
  onFocusAddressBar: (callback: () => void) => () => void
  repoList: () => Promise<ConnectedRepo[]>
  repoConnectViaPicker: () => Promise<ConnectedRepo | null>
  repoDisconnect: (id: string) => Promise<void>
  onReposChanged: (callback: (repos: ConnectedRepo[]) => void) => () => void
}

export interface CanvasBgElectronAPI {
  canvasZoom: (deltaY: number, mouseX: number, mouseY: number) => void
  canvasPan: (deltaX: number, deltaY: number) => void
  canvasPanTo: (x: number, y: number) => void
  /** Subscribe to main's canvas-selection-overlay broadcast (marquee rect). */
  onSelectionOverlayChanged: (
    callback: (overlay: SelectionOverlayPayload | null) => void,
  ) => () => void
  setSelectionOverlayRect: (
    overlay: SelectionOverlayPayload | null,
  ) => void
  canvasSelectInRect: (rect: WorkspaceBounds, modifiers?: SelectionModifiers) => void
  canvasSelectInScreenRect: (rect: WorkspaceBounds, modifiers?: SelectionModifiers) => void
  canvasDeselect: (modifiers?: SelectionModifiers) => void
  canvasClickAt: (
    screenX: number,
    screenY: number,
    modifiers?: SelectionModifiers,
  ) => void
  clearAnnotateHover: () => void
  selectFrame: (frameId: string, modifiers?: SelectionModifiers) => void
  selectBrowserTab: (frameId: string) => void
  addBrowserFrame: (presetIndex: number | 'custom') => void
  navigateFrame: (frameId: string, url: string) => void
  goBackFrame: (frameId: string) => void
  goForwardFrame: (frameId: string) => void
  reloadFrame: (frameId: string) => void
  setFrameCustom: (frameId: string) => void
  setBrowserSizeMode: (frameId: string, mode: 'fill' | 'device') => void
  updateFrameBounds: (frameId: string, patch: { width?: number; height?: number; canvasX?: number; canvasY?: number }) => void
  placePendingEntity: (canvasX: number, canvasY: number) => void
  cancelPendingPlacement: () => void
  clearToolMode: () => void
  startDragFrame: (frameId: string) => void
  dragFrame: (frameId: string, dx: number, dy: number) => void
  endDragFrame: () => void
  dragCopyFrame: (frameId: string, canvasX: number, canvasY: number) => void
  setFramePreset: (frameId: string, index: number) => void
  renameFrame: (frameId: string, name: string) => void
  duplicateFrame: (frameId: string) => void
  toggleLinkedFrame: (frameId: string) => void
  deleteFrame: (frameId: string) => void
  showFrameContextMenu: (frameId: string) => void
  dropdownOpen: () => void
  dropdownClose: () => void
  copySelection: () => void
  pasteSelection: (canvasX: number, canvasY: number) => void
  deleteSelectedEntities: () => void
  tidySelectedEntities: () => void
  createTextEntity: (canvasX: number, canvasY: number, text?: string, color?: string) => void
  updateTextEntity: (id: string, patch: { text?: string; color?: string; width?: number; height?: number; canvasX?: number; canvasY?: number }) => void
  duplicateTextEntity: (id: string) => void
  deleteTextEntity: (id: string) => void
  updateFileEntity: (id: string, patch: { width?: number; height?: number; canvasX?: number; canvasY?: number }) => void
  deleteFileEntity: (id: string) => void
  updateDrawingEntity: (id: string, patch: { width?: number; height?: number; canvasX?: number; canvasY?: number }) => void
  deleteDrawingEntity: (id: string) => void
  updateShapeEntity: (id: string, patch: { shapeKind?: ShapeKind; text?: string; color?: string; strokeWidth?: number; theme?: string; width?: number; height?: number; canvasX?: number; canvasY?: number }) => void
  deleteShapeEntity: (id: string) => void
  placePendingShape: (
    canvasX: number,
    canvasY: number,
    dragRect?: { x: number; y: number; width: number; height: number } | null,
  ) => void
  onShapeBeginEdit: (callback: (data: { entityId: string }) => void) => () => void
  showFileInFinder: (filePath: string) => void
  updateGroupEntity: (id: string, patch: { width?: number; height?: number; canvasX?: number; canvasY?: number; label?: string; color?: string }) => void
  duplicateGroup: (id: string) => void
  deleteGroup: (id: string) => void
  renameGroup: (groupId: string, name: string) => void
  renameFileEntity: (entityId: string, name: string) => void
  renameTextEntity: (entityId: string, name: string) => void
  renameDrawingEntity: (entityId: string, name: string) => void
  dropFileBuffer: (buffer: Uint8Array, ext: string, canvasX: number, canvasY: number) => void
  /** Drop a .tsx/.jsx file into the canvas without copying its bytes — the file
   *  stays in the user's repo and the entity references it by absolute path. */
  dropComponentFile: (file: File, canvasX: number, canvasY: number) => void
  selectEntity: (
    entityId: string,
    entityKind: CanvasEntityKind,
    modifiers?: SelectionModifiers,
  ) => void
  selectGroup: (groupId: string) => void
  enterGroup: (groupId: string) => void
  startDragGroup: (groupId: string) => void
  dragGroup: (groupId: string, dx: number, dy: number) => void
  endDragGroup: () => void
  startDragEntity: (entityId: string) => void
  dragEntity: (entityId: string, dx: number, dy: number) => void
  endDragEntity: () => void
  commitRegionSelect: (canvasRect: WorkspaceBounds) => void
  createAnnotation: (request: AnnotationCreateRequest) => void
  createDrawing: (input: { canvasX: number; canvasY: number; width: number; height: number; strokes: AnnotationDrawingStroke[] }) => void
  selectEntities: (entityIds: string[]) => void
  resizeMultiSelection: (entries: Array<{ id: string; kind: 'frame' | 'text' | 'file' | 'drawing' | 'shape'; width: number; height: number; canvasX: number; canvasY: number }>) => void
  deleteSelection: () => void
  moveAnnotation: (annotationId: string, dx: number, dy: number) => void
  addAnnotationReply: (annotationId: string, text: string) => void
  resolveAnnotation: (annotationId: string) => void
  deleteAnnotation: (annotationId: string) => void
  openAnnotationThread: (annotationId: string) => void
  setCommentOverlayActive: (active: boolean) => void
  onCaptureMode: (callback: (active: boolean) => void) => () => void
  onAnnotateElementSelected: (
    callback: (data: AnnotationElementSelectionPayload) => void,
  ) => () => void
  onRegionSelectCommitted: (
    callback: (data: { canvasRect: WorkspaceBounds }) => void,
  ) => () => void
  createRegionAnnotation: (canvasRect: WorkspaceBounds, text: string) => void
  onAnnotationThreadOpen: (
    callback: (data: { annotationId: string }) => void,
  ) => () => void
  beginEdgeDrag: (fromEntityId: string, fromSide: EdgeSide) => void
  updateEdgeDragTarget: (targetEntityId: string | null, targetSide: EdgeSide | null) => void
  commitEdgeDrag: (fromEntityId: string, toEntityId: string, fromSide: EdgeSide, toSide: EdgeSide) => void
  cancelEdgeDrag: () => void
  commitEdgeEdit: (
    edgeId: string,
    movingEnd: 'from' | 'to',
    targetEntityId: string,
    targetSide: EdgeSide,
  ) => void
  discardEdgeEdit: (edgeId: string) => void
  createEdge: (fromEntityId: string, toEntityId: string, fromSide?: EdgeSide, toSide?: EdgeSide) => void
  deleteEdge: (edgeId: string) => void
  selectEdge: (edgeId: string | null) => void
  hoverFrame: (frameId: string | null) => void
  setTextEditing: (active: boolean) => void
  readNoteFile: (filePath: string) => Promise<string | null>
  writeNoteFile: (filePath: string, content: string) => Promise<boolean>
  renameNoteFile: (filePath: string, newName: string) => Promise<string | null>
  getInitialData: () => Promise<CanvasLayoutBootstrapData>
  /** Connect a Vite repo at the given absolute folder path. Returns the
   *  connected repo, or null if connection fails. */
  repoConnect: (absolutePath: string) => Promise<unknown>
  onLayoutUpdate: (callback: (data: LayoutUpdateData) => void) => () => void
  onFixProgressUpdate: (
    callback: (data: LayoutUpdateData['fixProgress']) => void,
  ) => () => void
  onThemeChanged: (callback: (data: ThemeData) => void) => () => void
}

export interface FloatingUiElectronAPI {
  navigateFrame: (frameId: string, url: string) => void
  goBackFrame: (frameId: string) => void
  goForwardFrame: (frameId: string) => void
  reloadFrame: (frameId: string) => void
  setFramePreset: (frameId: string, index: number) => void
  setFrameCustom: (frameId: string) => void
  duplicateFrame: (frameId: string) => void
  toggleLinkedFrame: (frameId: string) => void
  deleteFrame: (frameId: string) => void
  updateTextEntity: (id: string, patch: { color?: string }) => void
  duplicateTextEntity: (id: string) => void
  deleteTextEntity: (id: string) => void
  deleteDrawingEntity: (id: string) => void
  startDragEntity: (entityId: string) => void
  dragEntity: (entityId: string, dx: number, dy: number) => void
  endDragEntity: () => void
  setTextEditing: (active: boolean) => void
  dropdownOpen: () => void
  dropdownClose: () => void
  onCloseDropdown: (callback: () => void) => () => void
  getInitialData: () => Promise<FloatingUiBootstrapData>
  onFloatingUiUpdate: (callback: (data: FloatingUiUpdatePayload) => void) => () => void
  onThemeChanged: (callback: (data: ThemeData) => void) => () => void
}

export interface AboveViewElectronAPI {
  canvasZoom: (deltaY: number, mouseX: number, mouseY: number) => void
  canvasPan: (deltaX: number, deltaY: number) => void
  onSelectionOverlayChanged: (
    callback: (overlay: SelectionOverlayPayload | null) => void,
  ) => () => void
}

export interface InteractionOverlayElectronAPI {
  canvasZoom: (deltaY: number, mouseX: number, mouseY: number) => void
  canvasPan: (deltaX: number, deltaY: number) => void
  onSelectionOverlayChanged: (
    callback: (overlay: SelectionOverlayPayload | null) => void,
  ) => () => void
}

export interface DevtoolsResizeHandleElectronAPI {
  devtoolsResizeStart: (screenX: number) => void
  devtoolsResizeMove: (screenX: number) => void
  devtoolsResizeEnd: () => void
  getInitialData: () => Promise<ThemeBootstrapData>
  onThemeChanged: (callback: (data: ThemeData) => void) => () => void
}

export interface LeftSidebarElectronAPI {
  revealFrame: (frameId: string) => void
  revealEntity: (entityId: string, entityKind: CanvasEntityKind) => void
  deleteEntity: (entityId: string, entityKind: CanvasEntityKind) => void
  revealGroup: (groupId: string) => void
  ungroupGroup: (groupId: string) => void
  selectTab: (tabId: string) => void
  createTab: () => void
  renameTab: (tabId: string, name: string) => void
  renameFrame: (frameId: string, name: string) => void
  renameGroup: (groupId: string, name: string) => void
  renameFileEntity: (entityId: string, name: string) => void
  renameTextEntity: (entityId: string, name: string) => void
  renameDrawingEntity: (entityId: string, name: string) => void
  duplicateTab: (tabId: string) => void
  deleteTab: (tabId: string) => void
  reorderTab: (tabId: string, toIndex: number) => void
  deleteFrame: (frameId: string) => void
  setTabExpanded: (tabId: string, expanded: boolean) => void
  setTextEditing: (active: boolean) => void
  toggleBrowserMode: () => void
  getInitialData: () => Promise<LeftSidebarBootstrapData>
  onThemeChanged: (callback: (data: ThemeData) => void) => () => void
  onSidebarData: (callback: (data: LeftSidebarData) => void) => () => void
}

export interface DevtoolsPanelElectronAPI {
  clearToolMode: () => void
  toggleAnnotateMode: () => void
  toggleDrawMode: () => void
  setTextEditing: (active: boolean) => void
  selectFrame: (frameId: string) => void
  clearInspectSelection: () => void
  setInspectHoverNode: (frameId: string, nodeId: string | null) => void
  setInspectSelectedNode: (frameId: string, nodeId: string | null) => void
  editComponentProp: (
    frameId: string,
    payload: { componentId: string; propPath: string[]; value: unknown },
  ) => void
  editComponentToken: (
    frameId: string,
    payload: { componentId?: string; token: string; value: string; selector?: string },
  ) => void
  createAnnotation: (request: AnnotationCreateRequest) => void
  resolveAnnotation: (annotationId: string) => void
  deleteAnnotation: (annotationId: string) => void
  openAnnotationThread: (annotationId: string) => void
  triggerFixComments: (origin: string) => void
  fixSingleAnnotation: (annotationId: string) => void
  setAutoFix: (origin: string, enabled: boolean) => void
  pickRepoForOrigin: (origin: string) => void
  removeOriginBinding: (origin: string) => void
  setFixConfig: (config: { model: FixModel; permissions: FixPermissions }) => void
  updateTextEntity: (id: string, patch: { color?: string }) => void
  duplicateTextEntity: (id: string) => void
  deleteTextEntity: (id: string) => void
  updateFileEntity: (id: string, patch: { objectFit?: FileObjectFit }) => void
  duplicateFileEntity: (id: string) => void
  deleteFileEntity: (id: string) => void
  setFilePreset: (fileId: string, presetIndex: number) => void
  setFileCustom: (fileId: string) => void
  setFileDeviceOrientation: (fileId: string, orientation: string) => void
  toggleFileDeviceShell: (fileId: string) => void
  deleteDrawingEntity: (id: string) => void
  updateShapeEntity: (id: string, patch: { shapeKind?: ShapeKind; text?: string; color?: string; strokeWidth?: number; theme?: string; width?: number; height?: number; canvasX?: number; canvasY?: number }) => void
  deleteShapeEntity: (id: string) => void
  updateEdge: (id: string, patch: { fromEnd?: EdgeEnd; toEnd?: EdgeEnd; fromSide?: EdgeSide; toSide?: EdgeSide; color?: string; label?: string }) => void
  deleteEdge: (id: string) => void
  setFramePreset: (frameId: string, presetIndex: number) => void
  setFrameCustom: (frameId: string) => void
  setDeviceOrientation: (frameId: string, orientation: string) => void
  toggleDeviceShell: (frameId: string) => void
  toggleSvgDeviceShell: (frameId: string) => void
  navigateFrame: (frameId: string, url: string) => void
  goBackFrame: (frameId: string) => void
  goForwardFrame: (frameId: string) => void
  reloadFrame: (frameId: string) => void
  duplicateFrame: (frameId: string) => void
  toggleLinkedFrame: (frameId: string) => void
  deleteFrame: (frameId: string) => void
  openBrowserDevTools: () => void
  closeBrowserDevTools: () => void
  getInitialData: () => Promise<ThemeBootstrapData>
  onThemeChanged: (callback: (data: ThemeData) => void) => () => void
  onPanelData: (callback: (data: DevtoolsPanelData) => void) => () => void
}

// --- Annotations ---

export type AnnotationAnchor =
  | { type: 'canvas'; canvasX: number; canvasY: number }
  | { type: 'frame'; frameId: string; offsetX: number; offsetY: number }
  | { type: 'element'; frameId: string; selector: string; elementPath?: string; boundingBox?: DevtoolsPanelDomRect }
  | { type: 'region'; canvasRect: WorkspaceBounds }

export type AnnotationStatus = 'pending' | 'acknowledged' | 'resolved' | 'dismissed'
export type AnnotationStatusFilter = AnnotationStatus | 'unresolved' | 'all'
export type AnnotationKind = 'comment' | 'region_select'

export interface AnnotationReply {
  author: 'user' | 'agent'
  text: string
  timestamp: string
}

export interface AnnotationDrawingPoint {
  x: number
  y: number
}

export interface AnnotationDrawingStroke {
  id: string
  color: string
  width: number
  points: AnnotationDrawingPoint[]
}

export interface AnnotationDrawing {
  version: 1
  bounds: { x: number; y: number; width: number; height: number }
  strokes: AnnotationDrawingStroke[]
}

export interface AnnotationElementSelectionPayload {
  frameId: string
  nodeId: string
  id: string
  timestamp: number
  tagName: string
  name: string
  role?: string
  elementPath: string
  fullPath: string
  cssClasses: string[]
  textPreview?: string
  nearbyText?: string
  nearbyElements: string[]
  accessibility: string[]
  attributes: DevtoolsPanelDomAttribute[]
  computedStyles: string[]
  boundingBox?: DevtoolsPanelDomRect
  position?: {
    viewportXPercent: number
    documentY: number
    isFixed: boolean
  }
  sourceLocation?: SourceLocation
}

export interface AnnotationInspectContext
  extends Omit<AnnotationElementSelectionPayload, 'frameId'> {
  frameId: string
  reactComponents?: string[]
  sourceLocation?: SourceLocation
}

export interface RegionComponentGroup {
  frameId: string
  frameName: string
  components: {
    name: string
    sourceLocation?: { file: string; line?: number; column?: number }
    count: number
  }[]
}

export interface RegionElementGroup {
  frameId: string
  frameName: string
  elements: unknown[]
}

export interface AnnotationMetadata extends Record<string, unknown> {
  inspectContext?: AnnotationInspectContext
  /** Human-readable frame label, e.g. "iPad Mini 768×1024" */
  frameName?: string
  /** Canonical page URL (hash removed) associated with the annotation anchor. */
  pageUrl?: string
  /** Base64-encoded PNG screenshot of the selected region. */
  regionScreenshot?: string
  /** React components found in the selected region, grouped by frame. */
  regionComponents?: RegionComponentGroup[]
  /** DOM elements found within the selected region, grouped by frame. */
  regionElements?: RegionElementGroup[]
  /** Who resolved this annotation, when status === 'resolved'. */
  resolvedBy?: 'user' | 'agent'
}

// --- Origin bindings (repo hookups for local dev URLs) ---

export interface OriginBinding {
  repoPath: string
  autoFix: boolean
}

export type OriginBindings = Record<string, OriginBinding>

// --- Fix config (model + permissions for the Claude subprocess) ---

export type FixModel = 'opus' | 'sonnet' | 'haiku'
export type FixPermissions = 'dangerously' | 'default'

export interface FixConfig {
  model: FixModel
  permissions: FixPermissions
  configured: boolean
}

// --- Fix progress (live stream of `claude -p` events per annotation) ---

export type FixProgressEventKind =
  | 'system'
  | 'text'
  | 'tool_use'
  | 'tool_result'
  | 'result'
  | 'stderr'
  | 'error'

export interface FixProgressEvent {
  kind: FixProgressEventKind
  text: string
  timestamp: string
}

export type FixProgressStatus = 'running' | 'completed' | 'failed'

export interface FixProgressEntry {
  annotationId: string
  origin: string
  startedAt: string
  updatedAt: string
  status: FixProgressStatus
  events: FixProgressEvent[]
  summary?: string
  shouldResolve?: boolean
  error?: string
}

export interface Annotation {
  id: string
  anchor: AnnotationAnchor
  author: 'user' | 'agent'
  text: string
  kind?: AnnotationKind
  status: AnnotationStatus
  replies: AnnotationReply[]
  createdAt: string
  metadata?: AnnotationMetadata
}

export interface AnnotationCreateRequest {
  anchor: AnnotationAnchor
  author?: 'user' | 'agent'
  text: string
  kind?: AnnotationKind
  metadata?: AnnotationMetadata
}

// --- Electron API Interfaces ---

export interface ChromeHeaderElectronAPI {
  navigate: (url: string) => void
  goBack: () => void
  goForward: () => void
  openDevTools: () => void
  duplicate: () => void
  reload: () => void
  toggleLinked: () => void
  debugLog: (...args: unknown[]) => void
  close: () => void
  drag: (dx: number, dy: number) => void
  select: () => void
  cyclePreset: (direction: number) => void
  setPreset: (index: number) => void
  dropdownOpen: () => void
  dropdownClose: () => void
  getInitialData: () => Promise<ThemeBootstrapData>
  onChromeUpdate: (callback: (data: ChromeUpdateData) => void) => () => void
  onThemeChanged: (callback: (data: ThemeData) => void) => () => void
}
