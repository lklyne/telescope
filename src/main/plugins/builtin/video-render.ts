import { VIDEO_EXTENSIONS } from '../../../shared/file-extensions'
import type { InlineRendererClaim } from '../registry'

export const videoRenderPlugin: InlineRendererClaim = {
  id: 'specular.video',
  kind: 'inline',
  rendererTag: 'video',
  claims: (entity) => VIDEO_EXTENSIONS.test(entity.file),
}
