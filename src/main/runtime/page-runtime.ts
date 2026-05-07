// Facade: re-exports page lifecycle and frame IPC functions.

export {
  findPageById,
  findPageByPageView,
  pages,
} from './runtime-context'
export { handleFrameIpcResponse, requestNodeDetail } from './frame-ipc'
export type { Page } from './runtime-entities'
export {
  getComponentAncestryByNodeId,
  getComponentSourceLocationByNodeId,
  handleNodeDetailResponse,
  setSelectedInspectNodeById,
} from './inspect-session'
export { createPage, removePageById } from './page-factory'

export {
  queryFrameElements,
  takeFrameAgentSnapshot,
  takeFrameScreenshot,
  takeFrameSnapshot,
} from './frame-queries'

export {
  setMcpConnectionStatus,
} from './runtime-core'
