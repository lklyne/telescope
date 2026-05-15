// ADR 0013 §3 — markdown file popup contribution. Surfaces the leading
// short/long toggle on `.md` selections; clicking `short` morphs the file
// entity back into a plain-text entity at the same canvas rect.

import type { CanvasBgElectronAPI, CanvasSceneFileEntity } from '../../../shared/types'
import { TextKindToggle } from '../TextKindToggle'

export function MarkdownMorphContribution({
  api,
  isDark,
  entity,
}: {
  api: Pick<CanvasBgElectronAPI, 'morphTextFile'>
  isDark: boolean
  entity: CanvasSceneFileEntity
}) {
  return (
    <TextKindToggle
      isDark={isDark}
      active="long"
      onPick={(kind) => {
        if (kind === 'short') {
          void api.morphTextFile(entity.id, 'file-to-text')
        }
      }}
    />
  )
}
