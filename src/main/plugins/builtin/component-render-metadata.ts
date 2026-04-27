import type { ComponentRenderMetadata, PersistedFileEntity } from '../../../shared/types'

const METADATA_KEY = 'componentRender'

/**
 * Read componentRender metadata off a file entity, defensive against
 * malformed input — older entities written before this metadata existed,
 * or third-party edits to the .canvas file, may have anything (or nothing)
 * at the key. Returns null when the metadata is absent or unusable.
 */
export function readComponentRenderMetadata(
  entity: PersistedFileEntity,
): ComponentRenderMetadata | null {
  const raw = entity.metadata?.[METADATA_KEY]
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const repoId = typeof record.repoId === 'string' ? record.repoId : null
  const repoRelativePath =
    typeof record.repoRelativePath === 'string' ? record.repoRelativePath : null
  return { repoId, repoRelativePath }
}
