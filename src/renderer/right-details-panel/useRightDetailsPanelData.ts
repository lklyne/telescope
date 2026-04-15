import { useEffect, useState } from 'react'
import type { DevtoolsPanelData } from '../../shared/types'
import { rightDetailsPanelApi } from './rightDetailsPanelApi'
import { INITIAL_PANEL_DATA } from './rightDetailsPanelHelpers'

export function useRightDetailsPanelData(): DevtoolsPanelData {
  const [panelData, setPanelData] = useState<DevtoolsPanelData>(INITIAL_PANEL_DATA)

  useEffect(() => rightDetailsPanelApi.onPanelData((data) => setPanelData(data)), [])

  return panelData
}
