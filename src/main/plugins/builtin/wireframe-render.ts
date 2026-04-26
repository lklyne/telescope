/**
 * Built-in wireframe renderer (inline). The React mount lives in
 * src/renderer/canvas-bg/FileBlockLayer.tsx for now; it switches on the
 * rendererTag broadcast in scene data.
 */

import type { InlineRendererClaim } from '../registry'

const WIREFRAME_EXTENSIONS = /\.wireframe\.json$/i

export const wireframeRenderPlugin: InlineRendererClaim = {
  id: 'telescope.wireframe',
  kind: 'inline',
  rendererTag: 'wireframe',
  // `.wireframe.json` is more specific than a generic `.json` would be,
  // so claim ahead of any future plugin that matches by parent extension.
  priority: 10,
  claims: (entity) => WIREFRAME_EXTENSIONS.test(entity.file),
}
