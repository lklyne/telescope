import { Trash2 } from 'lucide-react'
import type { CanvasSceneDrawingEntity } from '../../shared/types'
import { InlineEntityMenu, deleteButtonClassName } from '../canvas-bg/InlineEntityMenu'

export function DrawingInlineMenu({
  drawing,
  isDark,
  onDelete,
}: {
  drawing: CanvasSceneDrawingEntity
  isDark: boolean
  onDelete: () => void
}) {
  return (
    <InlineEntityMenu entity={drawing} isDark={isDark}>
      <button
        type="button"
        className={deleteButtonClassName(isDark)}
        onClick={onDelete}
        title="Delete Drawing"
        aria-label="Delete Drawing"
      >
        <Trash2 size={14} />
      </button>
    </InlineEntityMenu>
  )
}
