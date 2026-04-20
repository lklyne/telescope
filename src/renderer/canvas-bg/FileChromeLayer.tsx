import { memo, useCallback, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { EllipsisVertical, FileText, Maximize2 } from 'lucide-react'
import type { CanvasSceneFileEntity } from '../../shared/types'
import { MARKDOWN_EXTENSIONS, WIREFRAME_EXTENSIONS } from './entityConstants'
import { EntityChrome } from './EntityChromeHeader'
import { InlineEditLabel } from '../shared/InlineEditLabel'
import { WIREFRAME_THEME_OPTIONS } from './wireframe/WireframeRenderer'
import type { WireframeThemeName } from './wireframe/wireframe-types'

interface FileChromeCallbacks {
  onHoverEntity: (id: string | null) => void
  onStartDragEntity: (id: string) => void
  onDragEntity: (id: string, dx: number, dy: number) => void
  onEndDragEntity: () => void
  onRenameFileEntity: (entityId: string, newName: string) => void
  onWriteFile: (path: string, content: string) => Promise<boolean>
  /** Notify the card content that jsonMode changed. */
  onJsonModeChange: (entityId: string, jsonMode: boolean) => void
  onSetFocus: (entityId: string) => void
}

export function FileChromeLayer({
  entities,
  isDark,
  selectedEntityId,
  hoveredEntityId,
  isIdle,
  callbacks,
}: {
  entities: CanvasSceneFileEntity[]
  isDark: boolean
  selectedEntityId: string | null
  hoveredEntityId: string | null
  isIdle: boolean
  callbacks: FileChromeCallbacks
}) {
  // Only render chrome for markdown and wireframe files
  const chromeEntities = entities.filter(
    (e) => MARKDOWN_EXTENSIONS.test(e.file) || WIREFRAME_EXTENSIONS.test(e.file),
  )

  return (
    <>
      {chromeEntities.map((entity) => {
        const isSelected = entity.id === selectedEntityId && isIdle
        const isHovered = entity.id === hoveredEntityId
        return (
          <FileChromeItem
            key={entity.id}
            entity={entity}
            isDark={isDark}
            isSelected={isSelected}
            isActive={isSelected || isHovered}
            callbacks={callbacks}
          />
        )
      })}
    </>
  )
}

const FileChromeItem = memo(function FileChromeItem({
  entity,
  isDark,
  isSelected,
  isActive,
  callbacks,
}: {
  entity: CanvasSceneFileEntity
  isDark: boolean
  isSelected: boolean
  isActive: boolean
  callbacks: FileChromeCallbacks
}) {
  const isWireframe = WIREFRAME_EXTENSIONS.test(entity.file)
  const fileName = entity.file.split('/').pop() ?? entity.file
  const displayName = isWireframe
    ? fileName.replace(/\.wireframe\.json$/i, '')
    : fileName.replace(/\.md$/i, '')

  const [isRenaming, setIsRenaming] = useState(false)
  const [jsonMode, setJsonMode] = useState(false)

  // Wireframe theme — read from file content on demand
  const [wireframeTheme, setWireframeTheme] = useState<WireframeThemeName>('light')
  const readTheme = useCallback(async () => {
    if (!isWireframe) return
    try {
      const res = await fetch(
        entity.file.startsWith('local-file://') ? entity.file : `local-file://${entity.file}`,
      )
      const wf = JSON.parse(await res.text())
      setWireframeTheme(wf.theme ?? 'light')
    } catch { /* ignore */ }
  }, [entity.file, isWireframe])

  const handleThemeChange = useCallback(async (themeName: WireframeThemeName) => {
    try {
      const res = await fetch(
        entity.file.startsWith('local-file://') ? entity.file : `local-file://${entity.file}`,
      )
      const wf = JSON.parse(await res.text())
      wf.theme = themeName
      await callbacks.onWriteFile(entity.file, JSON.stringify(wf, null, 2))
      setWireframeTheme(themeName)
    } catch { /* ignore */ }
  }, [entity.file, callbacks])

  const startRename = useCallback(() => setIsRenaming(true), [])
  const cancelRename = useCallback(() => setIsRenaming(false), [])
  const commitRename = useCallback(
    (next: string) => {
      setIsRenaming(false)
      callbacks.onRenameFileEntity(entity.id, next)
    },
    [callbacks, entity.id],
  )

  const handleJsonModeToggle = useCallback(() => {
    const next = !jsonMode
    setJsonMode(next)
    callbacks.onJsonModeChange(entity.id, next)
  }, [jsonMode, entity.id, callbacks])

  const handleChromeMouseDown = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('[data-frame-context-menu]')) return
      event.preventDefault()
      callbacks.onStartDragEntity(entity.id)
      let lastX = event.clientX
      let lastY = event.clientY
      const handleMove = (me: MouseEvent) => {
        const dx = me.clientX - lastX
        const dy = me.clientY - lastY
        lastX = me.clientX
        lastY = me.clientY
        callbacks.onDragEntity(entity.id, dx, dy)
      }
      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
        callbacks.onEndDragEntity()
      }
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [entity.id, callbacks],
  )

  return (
    <EntityChrome.Root
      positioning={{
        mode: 'inline',
        screenX: entity.screenX,
        screenY: entity.screenY,
        screenWidth: entity.screenWidth,
      }}
      isDark={isDark}
      isActive={isActive}
      onMouseDown={!isRenaming ? handleChromeMouseDown : undefined}
      onMouseEnter={() => {
        callbacks.onHoverEntity(entity.id)
        if (isWireframe) readTheme()
      }}
      onMouseLeave={() => callbacks.onHoverEntity(null)}
    >
      <EntityChrome.DragTrigger
        onMouseDown={isRenaming ? (event) => event.stopPropagation() : undefined}
      >
        <FileText size={13} className="shrink-0 text-zinc-400" />
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
      </EntityChrome.DragTrigger>

      <EntityChrome.Actions>
        <EntityChrome.Button title="Focus this file" onClick={() => callbacks.onSetFocus(entity.id)}>
          <Maximize2 size={11} />
        </EntityChrome.Button>
        {isWireframe && (
          <Popover.Root onOpenChange={(open) => { if (open) readTheme() }}>
            <Popover.Trigger
              render={<EntityChrome.Button title="Wireframe settings" />}
            >
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
                  onMouseDown={(e) => e.stopPropagation()}
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
                    {jsonMode ? 'Switch to Visual' : 'Edit as JSON'}
                  </button>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        )}
      </EntityChrome.Actions>
    </EntityChrome.Root>
  )
})
