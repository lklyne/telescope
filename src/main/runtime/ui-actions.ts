// Facade: re-exports UI action functions.

export {
  deselectAll,
  selectPage,
  setBrowserMode,
  setCanvasMode,
  setSelectedFrames,
  toggleBrowserMode,
} from './selection-state'

export {
  dismissBrowserDevTools,
  focusAnnotation,
  openCommentsPanel,
  openDevToolsForSelectedPage,
  openInspectPanel,
  toggleLeftSidebar,
  toggleDevTools,
} from './devtools-panel'

export {
  setHoveredInspectTarget,
  setInspectMode,
  setInspectNodeFromPanel,
  setSelectedInspectNodeById,
  setSelectedInspectTarget,
} from './inspect-session'

export {
  cancelPendingPlacement,
  clearToolMode,
  isAnnotateMode,
  pendingPlacement,
  setDevtoolsPanelTab,
  startPendingPlacement,
  toggleAnnotateMode,
  toggleDrawMode,
  toggleRegionSelectMode,
  toggleInspectMode,
} from './tool-mode'

export { selectAdjacentPage } from './selection-state'

export { selectedPageId } from './runtime-context'

export {
  focusCanvasBounds,
  focusSelectedPage,
} from './viewport-control'

export {
  getSelectedEntityIds,
  getSelectedGroupId,
  selectBrowserTab,
  selectEntity,
  selectPageById,
  setHoverEntity,
  setSelectedEntities,
  setHoveredFrame,
  setSelectedGroupId,
} from './runtime-core'
