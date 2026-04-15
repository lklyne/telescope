import type { ToolbarElectronAPI } from '../../shared/types'

export const toolbarApi = (window as unknown as { electronAPI: ToolbarElectronAPI }).electronAPI
