import { PenLine, Trash2 } from 'lucide-react'
import type { PanelDrawingEntityDetail } from '../../../shared/types'
import { dividerClass, mutedClass, paneDeleteBtnClass } from '../rightDetailsPanelHelpers'
import { rightDetailsPanelApi } from '../rightDetailsPanelApi'
import { PaneHeader } from './PaneHeader'

export function DrawingEntityPane({
  drawingEntity,
  isDark,
}: {
  drawingEntity: PanelDrawingEntityDetail
  isDark: boolean
}) {
  const muted = mutedClass(isDark)
  const divider = dividerClass(isDark)
  const deleteBtnClass = paneDeleteBtnClass(isDark)

  return (
    <div className="flex flex-col">
      <PaneHeader
        icon={<PenLine size={14} className="shrink-0 text-zinc-500" />}
        label={`Drawing (${drawingEntity.strokeCount} stroke${drawingEntity.strokeCount === 1 ? '' : 's'})`}
        actions={
          <button
            type="button"
            className={deleteBtnClass}
            onClick={() => rightDetailsPanelApi.deleteDrawingEntity(drawingEntity.id)}
            title="Delete"
            aria-label="Delete Drawing"
          >
            <Trash2 size={14} />
          </button>
        }
      />

      <div className={`border-t px-2 pb-2 pt-2 ${divider}`}>
        <div className={`mb-1 text-[10px] font-medium ${muted}`}>Bounds</div>
        <div className={`rounded px-2 py-1.5 text-[11px] ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
          {drawingEntity.width} x {drawingEntity.height}
        </div>
      </div>

      <div className={`border-t px-2 pb-2 pt-2 ${divider}`}>
        <div className={`mb-1 text-[10px] font-medium ${muted}`}>Strokes</div>
        <div className={`rounded px-2 py-1.5 text-[11px] ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
          {drawingEntity.strokeCount}
        </div>
      </div>
    </div>
  )
}
