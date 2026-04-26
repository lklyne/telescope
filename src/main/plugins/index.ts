/**
 * Boot-time entry point for built-in entity-renderer plugins.
 *
 * Called once from src/main/index.ts after app.whenReady. Idempotent so
 * repeated calls (e.g. during hot-reload in dev) don't throw.
 */

import { registerEntityRenderer, unregisterEntityRenderer } from './registry'
import { componentRenderPlugin } from './builtin/component-render'

let registered = false

export function registerBuiltInPlugins(): void {
  if (registered) return
  registerEntityRenderer(componentRenderPlugin)
  registered = true
}

/** Test-only: undo registerBuiltInPlugins so a fresh registration round can run. */
export function __unregisterBuiltInPluginsForTests(): void {
  if (!registered) return
  unregisterEntityRenderer(componentRenderPlugin.id)
  registered = false
}
