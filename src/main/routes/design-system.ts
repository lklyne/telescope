import type { Route } from './types'
import type { DesignSystemManifest } from '../../shared/design-system-types'
import { clearManifest, getManifest, loadManifest } from '../design-system-store'
import { writeJson } from '../app-control-server'

export const designSystemRoutes: Route[] = [
  {
    method: 'GET',
    pattern: '/design-system',
    async handler({ response }) {
      writeJson(response, 200, getManifest())
    },
  },
  {
    method: 'POST',
    pattern: '/design-system/register',
    async handler({ response, body }) {
      const payload = body as { manifest?: unknown }
      if (!payload.manifest || typeof payload.manifest !== 'object') {
        writeJson(response, 400, { error: 'manifest is required' })
        return
      }
      writeJson(response, 200, {
        manifest: loadManifest(payload.manifest as DesignSystemManifest),
      })
    },
  },
  {
    method: 'DELETE',
    pattern: '/design-system',
    async handler({ response }) {
      clearManifest()
      writeJson(response, 200, { ok: true })
    },
  },
]
