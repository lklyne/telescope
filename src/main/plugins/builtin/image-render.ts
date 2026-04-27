import { IMAGE_EXTENSIONS } from '../../../shared/file-extensions'
import type { InlineRendererClaim } from '../registry'

export const imageRenderPlugin: InlineRendererClaim = {
  id: 'telescope.image',
  kind: 'inline',
  rendererTag: 'image',
  claims: (entity) => IMAGE_EXTENSIONS.test(entity.file),
}
