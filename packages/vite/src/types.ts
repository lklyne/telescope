/**
 * Shared types for the @telescope/vite plugin and the Telescope host.
 *
 * Mirrored by the host at src/main/plugins/builtin/component-render.ts so the
 * postMessage / console-bridge contract has a single source of truth.
 */

export interface TelescopePluginOptions {
  /**
   * Optional repo-relative glob list. Requests for paths outside this list are
   * rejected by the dev-server middleware. Defaults to allow-all.
   */
  allow?: string[]
}

export type TelescopeBridgeMessage =
  | { kind: 'ready'; path: string }
  | { kind: 'error'; message: string; stack?: string }
  | { kind: 'hmr'; phase: 'beforeUpdate' | 'afterUpdate' | 'error'; detail?: unknown }
