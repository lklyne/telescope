/**
 * Boot-time entry point for built-in entity-renderer plugins.
 *
 * Called once from src/main/index.ts after app.whenReady. Idempotent so
 * repeated calls (e.g. during hot-reload in dev) don't throw.
 */

import { registerEntityRenderer, unregisterEntityRenderer } from './registry'
import { componentRenderPlugin } from './builtin/component-render'
import { imageRenderPlugin } from './builtin/image-render'
import { markdownRenderPlugin } from './builtin/markdown-render'
import { videoRenderPlugin } from './builtin/video-render'
import { wireframeRenderPlugin } from './builtin/wireframe-render'

// Precedence is declared on each claim's `priority` field, not on this
// list's order. Listed alphabetically for readability.
const builtIns = [
  componentRenderPlugin,
  imageRenderPlugin,
  markdownRenderPlugin,
  videoRenderPlugin,
  wireframeRenderPlugin,
]

let registered = false

export function registerBuiltInPlugins(): void {
  if (registered) return
  for (const plugin of builtIns) registerEntityRenderer(plugin)
  registered = true
}

/** Test-only: undo registerBuiltInPlugins so a fresh registration round can run. */
export function __unregisterBuiltInPluginsForTests(): void {
  if (!registered) return
  for (const plugin of builtIns) unregisterEntityRenderer(plugin.id)
  registered = false
}
