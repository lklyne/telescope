import type { DevtoolsPanelElectronAPI } from '../../shared/types'

export const rightDetailsPanelApi = (
  window as unknown as { electronAPI: DevtoolsPanelElectronAPI }
).electronAPI
