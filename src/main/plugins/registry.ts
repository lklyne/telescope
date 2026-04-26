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

export type EntityRendererInlineTag =
  | 'markdown'
  | 'wireframe'
  | 'image'
  | 'video'
  | 'component'

export interface EntityRendererClaim {
  /** Stable id used for telemetry, debugging, and unregister. */
  id: string
  kind: EntityRendererKind
  /** Pure predicate: does this plugin claim the entity? */
  claims: (entity: PersistedFileEntity) => boolean
  /**
   * For 'wcv-page' renderers: produce the URL the page WebContents loads.
   * Async because resolving may require a dev-server lookup. Returning null
   * tells the host to render a placeholder.
   */
  resolveUrl?: (entity: PersistedFileEntity) => Promise<string | null> | string | null
  /**
   * For 'inline' renderers: a tag broadcast to the renderer over
   * LayoutUpdateData so the renderer-side dispatcher can pick a React
   * component without importing from src/main/.
   */
  inlineTag?: EntityRendererInlineTag
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
 */
export function pickRenderer(entity: PersistedFileEntity): EntityRendererClaim | null {
  for (const claim of claims) {
    if (claim.claims(entity)) return claim
  }
  return null
}

/** Convenience for the LayoutUpdateData broadcast — null when no inline match. */
export function getInlineTagFor(entity: PersistedFileEntity): EntityRendererInlineTag | null {
  const claim = pickRenderer(entity)
  if (!claim || claim.kind !== 'inline') return null
  return claim.inlineTag ?? null
}

/** Snapshot for debugging; not part of any IPC contract. */
export function listRegisteredRenderers(): readonly EntityRendererClaim[] {
  return claims
}

/** Test-only: drop all registrations. */
export function __resetRegistryForTests(): void {
  claims.length = 0
}
