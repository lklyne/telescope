import { registerAnnotationInspectionIpc } from './ipc/register-annotation-inspection-ipc'
import { registerAppIpc } from './ipc/register-app-ipc'
import { registerCanvasIpc } from './ipc/register-canvas-ipc'
import { registerPageChromeIpc } from './ipc/register-page-chrome-ipc'
import { registerRightDetailsPanelIpc } from './ipc/register-right-details-panel-ipc'
import { registerToolbarIpc } from './ipc/register-toolbar-ipc'

export function registerIpcHandlers(): void {
  registerAppIpc()
  registerToolbarIpc()
  registerCanvasIpc()
  registerRightDetailsPanelIpc()
  registerPageChromeIpc()
  registerAnnotationInspectionIpc()
}
