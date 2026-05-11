/**
 * WireframeJsonModeContribution — popup button that toggles a wireframe file
 * between visual mode and raw-JSON edit mode. State is owned by aboveView's
 * `App` so the `FileBodyLayer` can read it directly; this component reads
 * the current value and asks the parent to flip it.
 *
 * Migrated out of the legacy `FileChrome` wireframe Popover (ADR 0008 §7).
 */

import type { CanvasSceneFileEntity } from '../../../shared/types'
import { CanvasItemPopup } from '../CanvasItemPopup'

export function WireframeJsonModeContribution({
  isDark,
  entity,
  jsonMode,
  onJsonModeChange,
}: {
  isDark: boolean
  entity: CanvasSceneFileEntity
  jsonMode: boolean
  onJsonModeChange: (entityId: string, jsonMode: boolean) => void
}) {
  return (
    <CanvasItemPopup.Section>
      <button
        type="button"
        onClick={() => onJsonModeChange(entity.id, !jsonMode)}
        aria-pressed={jsonMode}
        className={`rounded-[7px] px-2 py-1 text-[11px] font-medium ${
          isDark
            ? jsonMode
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-300 hover:bg-zinc-800'
            : jsonMode
              ? 'bg-zinc-100 text-zinc-900'
              : 'text-zinc-600 hover:bg-zinc-100'
        }`}
      >
        {jsonMode ? 'Visual' : 'JSON'}
      </button>
    </CanvasItemPopup.Section>
  )
}
