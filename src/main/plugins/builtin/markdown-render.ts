/**
 * Built-in markdown renderer (inline). The React mount lives in
 * src/renderer/canvas-bg/FileBlockLayer.tsx for now; it switches on the
 * rendererTag broadcast in scene data.
 */

import type { InlineRendererClaim } from '../registry'

const MARKDOWN_EXTENSIONS = /\.md$/i

export const markdownRenderPlugin: InlineRendererClaim = {
  id: 'telescope.markdown',
  kind: 'inline',
  rendererTag: 'markdown',
  claims: (entity) => MARKDOWN_EXTENSIONS.test(entity.file),
}
