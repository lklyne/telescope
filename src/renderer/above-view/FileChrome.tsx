/**
 * FileChrome — per-file-entity chrome (filename label + rename, wireframe
 * theme picker, wireframe JSON-mode toggle) rendered in aboveView. Per
 * ADR 0002 §2.
 */

import { memo, useCallback, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { EllipsisVertical } from 'lucide-react'
import type {
  CanvasBgElectronAPI,
  CanvasSceneFileEntity,
  LayoutUpdateData,
} from '../../shared/types'
import { MARKDOWN_EXTENSIONS, WIREFRAME_EXTENSIONS } from '../canvas-bg/entityConstants'
import { CanvasItemChrome } from './CanvasItemChrome'
import { iconForFilePath } from '../shared/fileIcon'
import { InlineEditLabel } from '../shared/InlineEditLabel'
import { WIREFRAME_THEME_OPTIONS } from '../canvas-bg/wireframe/WireframeRenderer'
import type { WireframeThemeName } from '../canvas-bg/wireframe/wireframe-types'

export function FileChromeOverlay({
  api,
  layoutData,
  isDark,
  onJsonModeChange,
}: {
  api: CanvasBgElectronAPI
  layoutData: LayoutUpdateData
  isDark: boolean
  onJsonModeChange?: (entityId: string, jsonMode: boolean) => void
}) {
  if (layoutData.viewMode !== 'canvas') return null
  const fileEntities = layoutData.entities.filter(
    (e): e is CanvasSceneFileEntity => e.kind === 'file',
  )
  const chromeEntities = fileEntities.filter(
    (e) => MARKDOWN_EXTENSIONS.test(e.file) || WIREFRAME_EXTENSIONS.test(e.file),
  )
  const isIdle = layoutData.interaction.kind === 'idle'
  const selectedEntityId =
    layoutData.selectedEntityIds.length === 1 ? layoutData.selectedEntityIds[0] : null
  const hoveredEntityId = layoutData.hover?.id ?? null
  return (
    <>
      {chromeEntities.map((entity) => (
        <FileChromeItem
          key={entity.id}
          api={api}
          layoutData={layoutData}
          entity={entity}
          isDark={isDark}
          isSelected={entity.id === selectedEntityId && isIdle}
          isActive={(entity.id === selectedEntityId && isIdle) || entity.id === hoveredEntityId}
          onJsonModeChange={onJsonModeChange}
        />
      ))}
    </>
  )
}

const FileChromeItem = memo(function FileChromeItem({
  api,
  layoutData,
  entity,
  isDark,
  isSelected,
  isActive,
  onJsonModeChange,
}: {
  api: CanvasBgElectronAPI
  layoutData: LayoutUpdateData
  entity: CanvasSceneFileEntity
  isDark: boolean
  isSelected: boolean
  isActive: boolean
  onJsonModeChange?: (entityId: string, jsonMode: boolean) => void
}) {
  const isWireframe = WIREFRAME_EXTENSIONS.test(entity.file)
  const fileName = entity.file.split('/').pop() ?? entity.file
  const displayName = isWireframe
    ? fileName.replace(/\.wireframe\.json$/i, '')
    : fileName.replace(/\.md$/i, '')
  const FileIcon = iconForFilePath(entity.file)

  const [isRenaming, setIsRenaming] = useState(false)
  const [wireframeTheme, setWireframeTheme] = useState<WireframeThemeName>('light')
  const [jsonMode, setJsonMode] = useState(false)
  const handleJsonModeToggle = useCallback(() => {
    const next = !jsonMode
    setJsonMode(next)
    onJsonModeChange?.(entity.id, next)
  }, [jsonMode, entity.id, onJsonModeChange])

  const readTheme = useCallback(async () => {
    if (!isWireframe) return
    try {
      const res = await fetch(
        entity.file.startsWith('local-file://') ? entity.file : `local-file://${entity.file}`,
      )
      const wf = JSON.parse(await res.text())
      setWireframeTheme(wf.theme ?? 'light')
    } catch {
      /* ignore */
    }
  }, [entity.file, isWireframe])

  const handleThemeChange = useCallback(
    async (themeName: WireframeThemeName) => {
      try {
        const res = await fetch(
          entity.file.startsWith('local-file://') ? entity.file : `local-file://${entity.file}`,
        )
        const wf = JSON.parse(await res.text())
        wf.theme = themeName
        await api.writeNoteFile(entity.file, JSON.stringify(wf, null, 2))
        setWireframeTheme(themeName)
        // Chrome and body are siblings in this WCV — the body owns the
        // file-content state and won't see disk writes on its own. Ping it.
        window.dispatchEvent(
          new CustomEvent('wireframe-file-changed', { detail: { file: entity.file } }),
        )
      } catch {
        /* ignore */
      }
    },
    [api, entity.file],
  )

  const startRename = useCallback(() => setIsRenaming(true), [])
  const cancelRename = useCallback(() => setIsRenaming(false), [])
  const commitRename = useCallback(
    (next: string) => {
      setIsRenaming(false)
      api.renameFileEntity(entity.id, next)
    },
    [api, entity.id],
  )

  const onPointerDown = !isRenaming
    ? (event: React.PointerEvent) => {
        const target = event.target as HTMLElement
        if (target.closest('[data-frame-context-menu]')) return
        event.preventDefault()
        event.stopPropagation()
        const pointerId = event.pointerId
        const captureTarget = event.currentTarget
        try {
          captureTarget.setPointerCapture(pointerId)
        } catch {
          /* ignore */
        }
        const additive = event.shiftKey || event.metaKey || event.ctrlKey
        const modifiers = { shift: event.shiftKey, meta: event.metaKey, ctrl: event.ctrlKey }
        if (additive) {
          api.selectEntity(entity.id, 'file', modifiers)
          return
        }
        const preserve = layoutData.selectedEntityIds.includes(entity.id)
        api.startDragEntity(entity.id, { entityKind: 'file', preserveSelection: preserve })
        let lastX = event.screenX
        let lastY = event.screenY
        const cleanup = () => {
          try {
            if (captureTarget.hasPointerCapture(pointerId)) {
              captureTarget.releasePointerCapture(pointerId)
            }
          } catch {
            /* ignore */
          }
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          window.removeEventListener('pointercancel', onCancel)
          window.removeEventListener('blur', onCancel)
        }
        const finish = () => {
          cleanup()
          api.endDragEntity()
        }
        const onMove = (me: PointerEvent) => {
          if (me.pointerId !== pointerId) return
          const dx = me.screenX - lastX
          const dy = me.screenY - lastY
          lastX = me.screenX
          lastY = me.screenY
          if (dx !== 0 || dy !== 0) api.dragEntity(entity.id, dx, dy)
        }
        const onUp = (me: PointerEvent) => {
          if (me.pointerId !== pointerId) return
          finish()
        }
        const onCancel = () => finish()
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onCancel)
        window.addEventListener('blur', onCancel)
      }
    : undefined

  return (
    <CanvasItemChrome.Root
      entityId={entity.id}
      layout={layoutData}
      isDark={isDark}
      isActive={isActive}
      onPointerDown={onPointerDown}
      onMouseEnter={() => {
        api.hoverFrame(entity.id)
        if (isWireframe) readTheme()
      }}
      onMouseLeave={() => api.hoverFrame(null)}
    >
      <CanvasItemChrome.DragTrigger
        onPointerDown={isRenaming ? (event) => event.stopPropagation() : undefined}
      >
        <FileIcon size={13} className="shrink-0 text-zinc-400" />
        <InlineEditLabel
          value={displayName}
          isEditing={isRenaming}
          onStartEdit={startRename}
          onCommit={commitRename}
          onCancel={cancelRename}
          variant="canvas-chrome"
          isDark={isDark}
          onTitleClick={isSelected ? startRename : undefined}
        />
      </CanvasItemChrome.DragTrigger>

      {isWireframe && (
        <CanvasItemChrome.Actions>
          <Popover.Root onOpenChange={(open) => { if (open) readTheme() }}>
            <Popover.Trigger render={<CanvasItemChrome.Button title="Wireframe settings" />}>
              <EllipsisVertical size={13} />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner sideOffset={6} side="bottom" align="end">
                <Popover.Popup
                  className={`z-50 min-w-36 rounded-[10px] border p-2 shadow-xl outline-none ${
                    isDark
                      ? 'border-zinc-700 bg-zinc-900 text-zinc-100'
                      : 'border-zinc-200 bg-white text-zinc-900'
                  }`}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                    Theme
                  </div>
                  <div className="flex items-center gap-1.5 px-1 pb-2">
                    {WIREFRAME_THEME_OPTIONS.map((t) => (
                      <button
                        key={t.name}
                        onClick={() => handleThemeChange(t.name)}
                        title={t.name}
                        className="flex items-center gap-1.5"
                      >
                        <span
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            border: t.name === wireframeTheme
                              ? `2px solid ${isDark ? '#60a5fa' : '#3b82f6'}`
                              : `1.5px solid ${isDark ? '#3f3f46' : '#d4d4d8'}`,
                            background: t.color,
                            display: 'block',
                          }}
                        />
                      </button>
                    ))}
                    <span className="ml-1 text-[10px] capitalize text-zinc-400">
                      {wireframeTheme}
                    </span>
                  </div>
                  <div
                    style={{ height: 1, background: isDark ? '#3f3f46' : '#e4e4e7', margin: '0 -4px' }}
                  />
                  <button
                    onClick={handleJsonModeToggle}
                    className={`mt-1.5 flex w-full items-center gap-2 rounded-[7px] px-1 py-1.5 text-xs ${
                      isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                    }`}
                  >
                    {jsonMode ? 'Switch to visual' : 'Edit as JSON'}
                  </button>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        </CanvasItemChrome.Actions>
      )}
    </CanvasItemChrome.Root>
  )
})
