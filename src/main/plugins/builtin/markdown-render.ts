import { MARKDOWN_EXTENSIONS } from '../../../shared/file-extensions'
import type { InlineRendererClaim } from '../registry'

export const markdownRenderPlugin: InlineRendererClaim = {
  id: 'specular.markdown',
  kind: 'inline',
  rendererTag: 'markdown',
  editable: true,
  // ADR 0013 §3 — markdown files surface the leading short/long toggle in
  // the selection popup so the user can morph back to a plain-text entity.
  popupContributionTags: ['markdown-morph-to-text'],
  claims: (entity) => MARKDOWN_EXTENSIONS.test(entity.file),
}
