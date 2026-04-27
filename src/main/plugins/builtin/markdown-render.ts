import { MARKDOWN_EXTENSIONS } from '../../../shared/file-extensions'
import type { InlineRendererClaim } from '../registry'

export const markdownRenderPlugin: InlineRendererClaim = {
  id: 'telescope.markdown',
  kind: 'inline',
  rendererTag: 'markdown',
  claims: (entity) => MARKDOWN_EXTENSIONS.test(entity.file),
}
