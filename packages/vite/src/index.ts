import type { TelescopePluginOptions } from './types'

export type { TelescopePluginOptions, TelescopeBridgeMessage } from './types'

/**
 * Placeholder export. Implementation lands in Phase 1.5
 * (middleware + bootstrap + console-bridge).
 */
export default function telescope(_options: TelescopePluginOptions = {}) {
  return {
    name: 'telescope',
  }
}
