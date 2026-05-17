/**
 * Built-in component-render plugin.
 *
 * Claims component file entities (default: .tsx, .jsx, .svelte, .vue). The
 * extension set is driven by the userData `component-extensions.json` manifest
 * so it can be changed without rebuilding the app.
 *
 * The drop handler stamps `metadata.componentRender = { repoId, repoRelativePath }`
 * at drop time for diagnostics, but resolveUrl re-derives the repo from
 * `entity.file` on every call. That way a file dropped while the wrong repo
 * was the only match, or dropped before its repo was connected, heals the
 * moment the right repo shows up — without needing the canvas to be re-saved.
 *
 * Returning null (file outside any connected repo, or dev server failed
 * to start) tells the host to render the placeholder.
 */

import {
  findRepoForPath,
  urlForComponent,
} from '../../runtime/dev-server-manager'
import { isComponentFile } from '../../runtime/component-extensions'
import type { WcvPageRendererClaim } from '../registry'

export const componentRenderPlugin: WcvPageRendererClaim = {
  id: 'specular.component-render',
  kind: 'wcv-page',
  rendererTag: 'component',
  editable: false,
  claims: (entity) => isComponentFile(entity.file),
  resolveUrl: async (entity) => {
    const repo = findRepoForPath(entity.file)
    if (!repo) return null
    const relativePath =
      entity.file === repo.absolutePath
        ? ''
        : entity.file.slice(repo.absolutePath.length + 1)
    return urlForComponent(repo.id, relativePath)
  },
}
