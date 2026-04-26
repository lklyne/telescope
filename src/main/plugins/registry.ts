/**
 * Entity-renderer registry (internal, v1).
 *
 * First-party plugins register a "claim" against persisted file entities. The
 * file-entity dispatch site asks the registry which renderer wins; the result
 * is either an inline tag (rendered renderer-side via <RendererSwitch/>) or
 * a wcv-page contract (the host creates a Page-like WebContentsView triple
 * pointed at the URL the plugin resolves).
 *
 * No public exports. The registry is mutated only by built-in plugins via
 * registerBuiltInPlugins() in src/main/plugins/index.ts.
 */

import type { PersistedFileEntity } from '../../shared/types'

export type EntityRendererKind = 'inline' | 'wcv-page'

export type EntityRendererTag =
  | 'markdown'
  | 'wireframe'
  | 'image'
  | 'video'
  | 'component'

export interface EntityRendererClaim {
  /** Stable id used for telemetry, debugging, and unregister. */
  id: string
  kind: EntityRendererKind
  /**
   * Renderer-side dispatch key, broadcast as part of the scene data so
   * canvas-bg/entity-renderers/RendererSwitch can pick a React component
   * without importing from src/main/. Required regardless of kind:
   * inline plugins use it to pick their inline component, wcv-page
   * plugins use it to pick a placeholder shown while the WCV materializes.
   */
  rendererTag: EntityRendererTag
  /** Pure predicate: does this plugin claim the entity? */
  claims: (entity: PersistedFileEntity) => boolean
  /**
   * For 'wcv-page' renderers: produce the URL the page WebContents loads.
   * Async because resolving may require a dev-server lookup. Returning null
   * tells the host to render a placeholder.
   */
  resolveUrl?: (entity: PersistedFileEntity) => Promise<string | null> | string | null
}

const claims: EntityRendererClaim[] = []

export function registerEntityRenderer(claim: EntityRendererClaim): void {
  if (claims.some((c) => c.id === claim.id)) {
    throw new Error(`entity renderer already registered: ${claim.id}`)
  }
  claims.push(claim)
}

export function unregisterEntityRenderer(id: string): boolean {
  const index = claims.findIndex((c) => c.id === id)
  if (index < 0) return false
  claims.splice(index, 1)
  return true
}

/**
 * First registered claim that matches wins. Order is stable across the
 * process lifetime; built-in plugins register in a known order at boot.
 *
 * A throwing claims() predicate is logged and treated as "did not claim"
 * so one buggy plugin can't blank out every file behind it.
 */
export function pickRenderer(entity: PersistedFileEntity): EntityRendererClaim | null {
  for (const claim of claims) {
    try {
      if (claim.claims(entity)) return claim
    } catch (err) {
      console.error(
        `[entity-renderer] claim "${claim.id}" threw in claims(); skipping:`,
        err,
      )
    }
  }
  return null
}

/** Convenience: tag broadcast to the renderer; null when no plugin claims. */
export function getRendererTagFor(entity: PersistedFileEntity): EntityRendererTag | null {
  return pickRenderer(entity)?.rendererTag ?? null
}

/** Snapshot for debugging; not part of any IPC contract. */
export function listRegisteredRenderers(): readonly EntityRendererClaim[] {
  return claims
}

/** Test-only: drop all registrations. */
export function __resetRegistryForTests(): void {
  claims.length = 0
}
