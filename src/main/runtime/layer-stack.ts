/**
 * LAYER_STACK — the declarative z-order for singleton overlay WCVs.
 *
 * Pages (frameView/pageView) are added to the content view at
 * creation time (see page-factory.ts) and interleaved between `bgView`
 * (bottom) and the above-pages cluster by virtue of us re-adding `bgView`
 * at index 0 and then re-adding every above-pages WCV.
 *
 * `applyStack()` is the only function that calls `addChildView` on these
 * singletons. It is invoked exclusively from `layoutAllViews()` when the
 * 'stack' dirty flag is set (invariant I1).
 */

import type { WebContentsView } from 'electron'
import {
  bgView,
  aboveView,
  devtoolsBackgroundView,
  devtoolsHeaderView,
  devtoolsResizeHandleView,
  devtoolsView,
  leftSidebarView,
  toolbarView,
  win,
} from './view-refs'

export type LayerId =
  | 'bgView'
  | 'aboveView'
  | 'leftSidebar'
  | 'devtoolsBackground'
  | 'devtools'
  | 'devtoolsHeader'
  | 'devtoolsResizeHandle'
  | 'toolbar'

/**
 * Bottom → top. `bgView` pinned to index 0; everything else stacks above pages.
 *
 * `aboveView` is the sole above-pages overlay WCV. It owns marquee,
 * annotations, comments, presence, drawing, the floating-ui menus, and
 * the input-gate forwarding that interaction-overlay used to handle.
 */
export const LAYER_STACK: readonly LayerId[] = [
  'bgView',
  // pages live here (added at creation time by page-factory)
  'aboveView',
  'leftSidebar',
  'devtoolsBackground',
  'devtools',
  'devtoolsHeader',
  'devtoolsResizeHandle',
  'toolbar',
] as const

function resolve(id: LayerId): WebContentsView | null {
  switch (id) {
    case 'bgView': return bgView
    case 'aboveView': return aboveView
    case 'leftSidebar': return leftSidebarView
    case 'devtoolsBackground': return devtoolsBackgroundView
    case 'devtools': return devtoolsView
    case 'devtoolsHeader': return devtoolsHeaderView
    case 'devtoolsResizeHandle': return devtoolsResizeHandleView
    case 'toolbar': return toolbarView
  }
}

/**
 * Resolve LAYER_STACK to the ordered IDs present in the current view registry.
 * Pure (no Electron calls) — used for unit-test determinism.
 */
export function resolveStackOrder(
  refs: Partial<Record<LayerId, unknown>> = {},
): LayerId[] {
  const get = (id: LayerId) => (id in refs ? refs[id] : resolve(id))
  return LAYER_STACK.filter((id) => get(id) != null)
}

export function applyStack(): void {
  if (!win) return
  const view = resolve('bgView')
  if (view) win.contentView.addChildView(view, 0)
  for (const id of LAYER_STACK) {
    if (id === 'bgView') continue
    const v = resolve(id)
    if (v) win.contentView.addChildView(v)
  }
}
