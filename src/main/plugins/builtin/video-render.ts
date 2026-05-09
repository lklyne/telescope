import { VIDEO_EXTENSIONS } from '../../../shared/file-extensions'
import type { InlineRendererClaim } from '../registry'

export const videoRenderPlugin: InlineRendererClaim = {
  id: 'specular.video',
  kind: 'inline',
  rendererTag: 'video',
  // Edit mode unlocks the native `<video controls>` (scrubber, volume) and
  // drops the click-blocking overlay so playback responds to clicks.
  editable: true,
  claims: (entity) => VIDEO_EXTENSIONS.test(entity.file),
}
