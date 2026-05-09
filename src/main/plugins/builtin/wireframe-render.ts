import { WIREFRAME_EXTENSIONS } from '../../../shared/file-extensions'
import type { InlineRendererClaim } from '../registry'

export const wireframeRenderPlugin: InlineRendererClaim = {
  id: 'specular.wireframe',
  kind: 'inline',
  rendererTag: 'wireframe',
  // `.wireframe.json` is more specific than a generic `.json` would be,
  // so claim ahead of any future plugin that matches by parent extension.
  priority: 10,
  editable: true,
  claims: (entity) => WIREFRAME_EXTENSIONS.test(entity.file),
}
