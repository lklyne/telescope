import { FolderOpen } from 'lucide-react'
import type { PanelGroupEntityDetail } from '../../../shared/types'
import { dividerClass, mutedClass } from '../rightDetailsPanelHelpers'
import { PaneHeader } from './PaneHeader'

export function GroupEntityPane({
  groupEntity,
  isDark,
}: {
  groupEntity: PanelGroupEntityDetail
  isDark: boolean
}) {
  const muted = mutedClass(isDark)
  const divider = dividerClass(isDark)

  return (
    <div className="flex flex-col">
      <PaneHeader
        icon={<FolderOpen size={14} className="shrink-0 text-zinc-500" />}
        label={groupEntity.label || 'Group'}
      />

      {groupEntity.color ? (
        <div className={`border-t px-2 pt-2 pb-2 ${divider}`}>
          <div className={`mb-1 text-[10px] font-medium ${muted}`}>Color</div>
          <div className="flex items-center gap-2">
            <div
              className="size-4 shrink-0 rounded border border-zinc-300 dark:border-zinc-600"
              style={{ backgroundColor: groupEntity.color }}
            />
            <span className="text-[11px]">{groupEntity.color}</span>
          </div>
        </div>
      ) : null}

      <div className={`border-t px-2 pt-2 pb-2 ${divider}`}>
        <div className={`mb-1 text-[10px] font-medium ${muted}`}>Members</div>
        <div className="text-[11px]">
          {groupEntity.entityIds.length} {groupEntity.entityIds.length === 1 ? 'entity' : 'entities'}
        </div>
      </div>
    </div>
  )
}
