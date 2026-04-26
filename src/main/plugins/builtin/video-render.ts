/**
 * Built-in video renderer (inline). See image-render.ts for the
 * "registry as single source of truth" rationale.
 */

import type { InlineRendererClaim } from '../registry'

const VIDEO_EXTENSIONS = /\.(webm|mp4|mov|ogg)$/i

export const videoRenderPlugin: InlineRendererClaim = {
  id: 'telescope.video',
  kind: 'inline',
  rendererTag: 'video',
  claims: (entity) => VIDEO_EXTENSIONS.test(entity.file),
}
