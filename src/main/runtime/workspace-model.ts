/**
 * Workspace Model
 *
 * Owns the workspace data collections: groups, edges, annotations, and tabs.
 * These are the persisted, undoable workspace state. Pages (frames) remain
 * in runtime-context.ts because they hold non-serializable WebContentsView refs.
 *
 * The Y.Doc in workspace-doc.ts mirrors this data for undo/redo.
 * The diff-sync in workspace-observers.ts keeps them in sync.
 */

import type {
  Annotation,
  PersistedWorkspaceTab,
  WorkspaceEdge,
  WorkspaceGroup,
} from '../../shared/types'
import { breadcrumb } from '../sentry-context'

export const workspaceAnnotations: Annotation[] = []
export const workspaceGroups: WorkspaceGroup[] = []
export const workspaceEdges: WorkspaceEdge[] = []
export const workspaceTabs: PersistedWorkspaceTab[] = []
export let activeWorkspaceTabId: string | null = null

export function setActiveWorkspaceTabId(value: string | null): void {
  if (value !== activeWorkspaceTabId) {
    breadcrumb('tab', 'switch', { from: activeWorkspaceTabId, to: value, tab_count: workspaceTabs.length })
  }
  activeWorkspaceTabId = value
}
