import type { LeftSidebarData, SidebarProjectSection } from '../../shared/types'

export interface ActiveCanvasRef {
  projectId: string
  canvasId: string
}

/**
 * Walk the workspace tabs and return the globally active canvas's tab id and
 * the project section it lives in. Returns null when nothing is active.
 */
export function findGloballyActiveCanvas(data: LeftSidebarData): ActiveCanvasRef | null {
  const activeTab = data.tabs.find((tab) => tab.isActive)
  if (!activeTab) return null
  const projectId = activeTab.projectId ?? 'scratchpad'
  return { projectId, canvasId: activeTab.id }
}

export function sectionContainsActive(
  section: SidebarProjectSection,
  activeCanvasId: string | null,
): boolean {
  if (!activeCanvasId) return false
  return section.canvases.some((canvas) => canvas.id === activeCanvasId)
}
