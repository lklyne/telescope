/**
 * Built-in component-render plugin.
 *
 * Claims `.tsx` and `.jsx` file entities. The drop handler stamps
 * `metadata.componentRender = { repoId, repoRelativePath }` at file-entity
 * creation; resolveUrl reads it back and asks the dev-server manager for
 * a live URL, lazily spawning `vite dev` for that repo on first request.
 *
 * Returning null (no metadata, missing repo, dev server failed to start)
 * tells the host to render the placeholder.
 */

import { urlForComponent } from '../../runtime/dev-server-manager'
import type { WcvPageRendererClaim } from '../registry'
import { readComponentRenderMetadata } from './component-render-metadata'

const COMPONENT_EXTENSIONS = /\.(tsx|jsx)$/i

export const componentRenderPlugin: WcvPageRendererClaim = {
  id: 'telescope.component-render',
  kind: 'wcv-page',
  rendererTag: 'component',
  claims: (entity) => COMPONENT_EXTENSIONS.test(entity.file),
  resolveUrl: async (entity) => {
    const meta = readComponentRenderMetadata(entity)
    if (!meta || !meta.repoId || meta.repoRelativePath === null) return null
    return urlForComponent(meta.repoId, meta.repoRelativePath)
  },
}
