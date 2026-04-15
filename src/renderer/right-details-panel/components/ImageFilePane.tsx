import { Copy, Image, Trash2 } from 'lucide-react'
import type { PanelFileEntityDetail } from '../../../shared/types'
import { paneDeleteBtnClass as deleteBtnClass, dividerClass, paneActionBtnClass as iconBtnClass, mutedClass } from '../rightDetailsPanelHelpers'
import { rightDetailsPanelApi } from '../rightDetailsPanelApi'
import { FileDeviceSection } from './FileDeviceSection'
import { PaneHeader } from './PaneHeader'

const FIT_OPTIONS: Array<{ value: 'contain' | 'cover' | 'fill'; label: string }> = [
  { value: 'contain', label: 'Contain' },
  { value: 'cover', label: 'Cover' },
  { value: 'fill', label: 'Fill' },
]

export function ImageFilePane({
  fileEntity,
  isDark,
}: {
  fileEntity: PanelFileEntityDetail
  isDark: boolean
}) {
  const muted = mutedClass(isDark)
  const divider = dividerClass(isDark)
  const fileName = fileEntity.file.split('/').pop() ?? 'Image'
  const activeFit = fileEntity.objectFit ?? 'contain'

  return (
    <div className="flex flex-col">
      <PaneHeader
        icon={<Image size={14} className="shrink-0 text-zinc-500" />}
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
        <div className={`mb-1.5 text-[10px] font-medium ${muted}`}>Object Fit</div>
        <div className="flex gap-1">
          {FIT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => rightDetailsPanelApi.updateFileEntity(fileEntity.id, { objectFit: opt.value })}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                activeFit === opt.value
                  ? isDark
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'bg-zinc-200 text-zinc-900'
                  : isDark
                    ? 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

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
