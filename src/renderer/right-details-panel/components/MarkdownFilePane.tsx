import { Copy, FileText, Trash2 } from 'lucide-react'
import type { PanelFileEntityDetail } from '../../../shared/types'
import { paneDeleteBtnClass as deleteBtnClass, dividerClass, paneActionBtnClass as iconBtnClass, mutedClass } from '../rightDetailsPanelHelpers'
import { rightDetailsPanelApi } from '../rightDetailsPanelApi'
import { FileDeviceSection } from './FileDeviceSection'
import { PaneHeader } from './PaneHeader'

export function MarkdownFilePane({
  fileEntity,
  isDark,
}: {
  fileEntity: PanelFileEntityDetail
  isDark: boolean
}) {
  const muted = mutedClass(isDark)
  const divider = dividerClass(isDark)
  const fileName = fileEntity.file.split('/').pop()?.replace(/\.md$/i, '') ?? 'Note'

  return (
    <div className="flex flex-col">
      <PaneHeader
        icon={<FileText size={14} className="shrink-0 text-zinc-500" />}
        label={fileName}
        actions={
          <>
            <button
              type="button"
              className={iconBtnClass(isDark)}
              onClick={() => rightDetailsPanelApi.duplicateFileEntity(fileEntity.id)}
              title="Duplicate"
            >
              <Copy size={14} />
            </button>
            <button
              type="button"
              className={deleteBtnClass(isDark)}
              onClick={() => rightDetailsPanelApi.deleteFileEntity(fileEntity.id)}
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </>
        }
      />

      <FileDeviceSection fileEntity={fileEntity} isDark={isDark} divider={divider} />

      <div className={`border-t px-2 pt-2 pb-2 ${divider}`}>
        <div className={`mb-1 text-[10px] font-medium ${muted}`}>Dimensions</div>
        <div className={`text-[11px] ${muted}`}>
          {fileEntity.width} × {fileEntity.height}
        </div>
      </div>

      <div className={`border-t px-2 pt-2 pb-2 ${divider}`}>
        <div className={`mb-1 text-[10px] font-medium ${muted}`}>Path</div>
        <div
          className={`break-all rounded px-2 py-1.5 text-[11px] leading-5 ${
            isDark ? 'bg-zinc-800' : 'bg-zinc-100'
          }`}
          title={fileEntity.file}
        >
          {fileEntity.file}
        </div>
      </div>
    </div>
  )
}
