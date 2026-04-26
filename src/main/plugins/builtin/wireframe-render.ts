/**
 * Built-in wireframe renderer (inline). The React mount lives in
 * src/renderer/canvas-bg/FileBlockLayer.tsx for now; it switches on the
 * rendererTag broadcast in scene data.
 */

import type { EntityRendererClaim } from '../registry'

const WIREFRAME_EXTENSIONS = /\.wireframe\.json$/i

export const wireframeRenderPlugin: EntityRendererClaim = {
  id: 'telescope.wireframe',
  kind: 'inline',
  rendererTag: 'wireframe',
  // Order matters: wireframe must be registered BEFORE markdown so that a
  // file ending in `.wireframe.json` is not also half-claimed by markdown
  // (it isn't today — different regex — but the precedence is intentional).
  claims: (entity) => WIREFRAME_EXTENSIONS.test(entity.file),
}
