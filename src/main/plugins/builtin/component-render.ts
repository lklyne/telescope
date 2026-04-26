/**
 * Built-in component-render plugin.
 *
 * Phase 1.3: declaration only. resolveUrl returns null until the dev-server
 * manager (Phase 1.4) and the @telescope/vite middleware (Phase 1.5) are
 * wired; the host treats null as "render a placeholder."
 */

import type { WcvPageRendererClaim } from '../registry'

const COMPONENT_EXTENSIONS = /\.(tsx|jsx)$/i

export const componentRenderPlugin: WcvPageRendererClaim = {
  id: 'telescope.component-render',
  kind: 'wcv-page',
  rendererTag: 'component',
  claims: (entity) => COMPONENT_EXTENSIONS.test(entity.file),
  resolveUrl: () => null,
}
