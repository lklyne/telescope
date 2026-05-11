/**
 * FilePopup — selection-driven popup for file entities (ADR 0008). Replaces
 * the action affordances that previously lived in `FileChrome` (rename,
 * wireframe theme, JSON-mode toggle). The chrome shrinks to favicon +
 * filename identity-only.
 *
 * Per ADR §7, per-renderer contributions (wireframe theme + json toggle)
 * come from the renderer plugin contribution surface — `entity.popupContributions`
 * carries the tags, `renderPopupContributions` picks the React components.
 *
 * Mounts on single OR same-kind multi-select (ADR 0008 §4). Rename and the
 * plugin contribution row hide on multi (per-entity affordances) — multi
 * collapses to dup/del.
 */

import { useEffect, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import type {
  CanvasBgElectronAPI,
  CanvasSceneFileEntity,
  LayoutUpdateData,
} from '../../shared/types'
import { CanvasItemPopup } from './CanvasItemPopup'
import { iconForFilePath } from '../shared/fileIcon'
import { InlineEditLabel } from '../shared/InlineEditLabel'
import { MARKDOWN_EXTENSIONS, WIREFRAME_EXTENSIONS } from '../canvas-bg/entityConstants'
import { renderPopupContributions } from './file-popup-contributions'
import { POPUP_OFFSET_Y, usePopupDelayedKey } from './usePopupDelayedKey'

function displayNameFor(file: string): string {
  const base = file.split('/').pop() ?? file
  if (WIREFRAME_EXTENSIONS.test(file)) return base.replace(/\.wireframe\.json$/i, '')
  if (MARKDOWN_EXTENSIONS.test(file)) return base.replace(/\.md$/i, '')
  return base
}

export function FilePopup({
  api,
  isDark,
  layout,
  selectedFiles,
  interactionIdle,
  fileJsonModeMap,
  setFileJsonMode,
}: {
  api: Pick<
    CanvasBgElectronAPI,
    'renameFileEntity' | 'duplicateFileEntity' | 'deleteFileEntity' | 'writeNoteFile'
  >
  isDark: boolean
  layout: LayoutUpdateData
  selectedFiles: CanvasSceneFileEntity[]
  interactionIdle: boolean
  fileJsonModeMap: ReadonlyMap<string, boolean>
  setFileJsonMode: (entityId: string, jsonMode: boolean) => void
}) {
  const count = selectedFiles.length
  const ids = selectedFiles.map((f) => f.id).join('|')
  const open = usePopupDelayedKey(ids, interactionIdle && count > 0)

  const [isRenaming, setIsRenaming] = useState(false)
  useEffect(() => {
    setIsRenaming(false)
  }, [ids])

  if (count === 0) return null
  const isSingle = count === 1
  const single = isSingle ? selectedFiles[0] : null
  const entityIds = selectedFiles.map((f) => f.id)
  const noun = isSingle ? 'file' : `${count} files`

  return (
    <CanvasItemPopup.Root
      entityIds={entityIds}
      layout={layout}
      open={open}
      placement="above"
      offset={POPUP_OFFSET_Y}
    >
      <CanvasItemPopup.Frame isDark={isDark}>
        {single ? (
          <CanvasItemPopup.Section>
            <span className="flex items-center gap-1.5">
              {(() => {
                const FileIcon = iconForFilePath(single.file)
                return <FileIcon size={13} className="shrink-0 text-zinc-400" />
              })()}
              <InlineEditLabel
                value={displayNameFor(single.file)}
                isEditing={isRenaming}
                onStartEdit={() => setIsRenaming(true)}
                onCommit={(next) => {
                  setIsRenaming(false)
                  api.renameFileEntity(single.id, next)
                }}
                onCancel={() => setIsRenaming(false)}
                variant="canvas-chrome"
                isDark={isDark}
                titleClassName="min-w-0 truncate text-xs font-medium"
                onTitleClick={() => setIsRenaming(true)}
              />
            </span>
          </CanvasItemPopup.Section>
        ) : null}
        {single
          ? renderPopupContributions(single, {
              api,
              isDark,
              jsonMode: fileJsonModeMap.get(single.id) ?? false,
              onJsonModeChange: setFileJsonMode,
            })
          : null}
        <CanvasItemPopup.Section>
          <CanvasItemPopup.IconButton
            isDark={isDark}
            title={`Duplicate ${noun}`}
            ariaLabel={`Duplicate ${noun}`}
            onClick={() => {
              for (const f of selectedFiles) api.duplicateFileEntity(f.id)
            }}
          >
            <Copy size={14} />
          </CanvasItemPopup.IconButton>
          <CanvasItemPopup.DestructiveButton
            isDark={isDark}
            title={`Delete ${noun}`}
            ariaLabel={`Delete ${noun}`}
            onClick={() => {
              for (const f of selectedFiles) api.deleteFileEntity(f.id)
            }}
          >
            <Trash2 size={14} />
          </CanvasItemPopup.DestructiveButton>
        </CanvasItemPopup.Section>
      </CanvasItemPopup.Frame>
    </CanvasItemPopup.Root>
  )
}
