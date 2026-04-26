/**
 * Built-in image renderer (inline). The actual React mounts still live
 * in src/renderer/canvas-bg/FileBlockLayer.tsx; this entry exists so
 * the registry is the single source of truth for "what tag does the
 * scene builder broadcast for this file?"
 */

import type { InlineRendererClaim } from '../registry'

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i

export const imageRenderPlugin: InlineRendererClaim = {
  id: 'telescope.image',
  kind: 'inline',
  rendererTag: 'image',
  claims: (entity) => IMAGE_EXTENSIONS.test(entity.file),
}
