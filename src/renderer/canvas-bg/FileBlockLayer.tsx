import { memo, useCallback, useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import { ContextMenu } from '@base-ui/react/context-menu'
import { Menu } from '@base-ui/react/menu'
import type { CanvasSceneFileEntity, SelectionModifiers } from '../../shared/types'
import { SelectableEntityShell } from './SelectableEntityShell'
import { aspectRatioResizeModeForCanvasFile, type EntityResizePatch, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, MARKDOWN_EXTENSIONS, WIREFRAME_EXTENSIONS } from './entityConstants'
import { MIN_FILE_WIDTH, MIN_FILE_HEIGHT } from './entityConstants'
import { WireframeRenderer } from './wireframe/WireframeRenderer'

function filePathToSrc(filePath: string): string {
  if (filePath.startsWith('local-file://') || filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath
  }
  return `local-file://${filePath}`
}

function FileBlockCard({
  entity,
  getZoom,
  isDark,
  isSelected,
  isMarqueePreview,
  canEdit,
  wireframeJsonMode,
  onSelect,
  onResize,
  onTextEditingChange,
  onDragStart,
  onDrag,
  onDragEnd,
  selectedGroupDragTargetId,
  onGroupDragStart,
  onGroupDrag,
  onGroupDragEnd,
}: {
  entity: CanvasSceneFileEntity
  getZoom: () => number
  isDark: boolean
  isSelected: boolean
  isMarqueePreview: boolean
  canEdit: boolean
  wireframeJsonMode: boolean
  onSelect: (id: string, modifiers?: SelectionModifiers) => void
  onResize: (id: string, patch: EntityResizePatch) => void
  onTextEditingChange: (active: boolean) => void
  onDragStart: (id: string) => void
  onDrag: (id: string, dx: number, dy: number) => void
  onDragEnd: () => void
  selectedGroupDragTargetId?: string | null
  onGroupDragStart: (groupId: string) => void
  onGroupDrag: (groupId: string, dx: number, dy: number) => void
  onGroupDragEnd: () => void
}) {
  const isImage = IMAGE_EXTENSIONS.test(entity.file)
  const isVideo = VIDEO_EXTENSIONS.test(entity.file)
  const isMarkdown = MARKDOWN_EXTENSIONS.test(entity.file)
  const isWireframe = WIREFRAME_EXTENSIONS.test(entity.file)
  const fileName = entity.file.split('/').pop() ?? entity.file
  const fileApi = (window as unknown as { electronAPI: { showFileInFinder: (path: string) => void; readNoteFile: (path: string) => Promise<string | null>; writeNoteFile: (path: string, content: string) => Promise<boolean>; renameNoteFile: (path: string, newName: string) => Promise<string | null> } }).electronAPI

  // Load markdown file content
  const [mdContent, setMdContent] = useState<string | null>(null)
  const [localMdText, setLocalMdText] = useState('')
  const isFocusedRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load wireframe file content
  const [wireframeContent, setWireframeContent] = useState<string | null>(null)
  const wireframeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchNoteContent = useCallback(() => {
    const src = filePathToSrc(entity.file) + `?t=${Date.now()}`
    if (isWireframe) {
      fetch(src)
        .then((res) => res.text())
        .then((text) => setWireframeContent(text))
        .catch(() => {})
    } else if (isMarkdown) {
      fetch(src)
        .then((res) => res.text())
        .then((text) => {
          setMdContent(text)
          if (!isFocusedRef.current) setLocalMdText(text)
        })
        .catch(() => {})
    }
  }, [entity.file, isWireframe, isMarkdown])

  // Initial load
  useEffect(() => {
    if (!isWireframe && !isMarkdown) return
    let cancelled = false
    const src = filePathToSrc(entity.file)
    fetch(src)
      .then((res) => res.text())
      .then((text) => {
        if (cancelled) return
        if (isWireframe) setWireframeContent(text)
        if (isMarkdown) {
          setMdContent(text)
          if (!isFocusedRef.current) setLocalMdText(text)
        }
      })
      .catch(() => {
        if (cancelled) return
        if (isWireframe) setWireframeContent(null)
        if (isMarkdown) setMdContent(null)
      })
    return () => { cancelled = true }
  }, [isWireframe, isMarkdown, entity.file])

  // Re-fetch when the window regains visibility (covers external edits by agents, editors, etc.)
  useEffect(() => {
    if (!isWireframe && !isMarkdown) return
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      // Skip if user has a pending local write
      if (wireframeDebounceRef.current || debounceRef.current) return
      if (isFocusedRef.current) return
      fetchNoteContent()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [isWireframe, isMarkdown, fetchNoteContent])

  const handleWireframeChange = useCallback((json: string) => {
    setWireframeContent(json)
    if (wireframeDebounceRef.current) clearTimeout(wireframeDebounceRef.current)
    wireframeDebounceRef.current = setTimeout(() => {
      fileApi.writeNoteFile(entity.file, json)
      wireframeDebounceRef.current = null
    }, 300)
  }, [entity.file, fileApi])

  // Clear editing state when edit mode is lost
  useEffect(() => {
    if (!canEdit && isFocusedRef.current) {
      isFocusedRef.current = false
      onTextEditingChange(false)
    }
  }, [canEdit, onTextEditingChange])

  const handleMdTextChange = (value: string) => {
    setLocalMdText(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fileApi.writeNoteFile(entity.file, value)
      debounceRef.current = null
    }, 300)
  }

  const menuPopupClass = `z-50 min-w-40 rounded-[10px] border p-1 shadow-xl outline-none ${
    isDark
      ? 'border-zinc-700 bg-zinc-900 text-zinc-100'
      : 'border-zinc-200 bg-white text-zinc-900'
  }`
  const menuItemClass = `flex cursor-default items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-xs outline-none ${
    isDark
      ? 'text-zinc-100 data-[highlighted]:bg-zinc-800'
      : 'text-zinc-900 data-[highlighted]:bg-zinc-100'
  }`

  return (
    <SelectableEntityShell
      id={entity.id}
      canvasX={entity.canvasX}
      canvasY={entity.canvasY}
      width={entity.width}
      height={entity.height}
      getZoom={getZoom}
      minWidth={MIN_FILE_WIDTH}
      minHeight={MIN_FILE_HEIGHT}
      isDark={isDark}
      isSelected={isSelected}
      isMarqueePreview={isMarqueePreview}
      background={entity.showDeviceFrame ? 'transparent' : (isDark ? '#1c1917' : '#fafaf9')}
      borderRadius={entity.showDeviceFrame ? 0 : 4}
      showCardShadow={!entity.showDeviceFrame}
      onSelect={onSelect}
      onResize={onResize}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      selectedGroupDragTargetId={selectedGroupDragTargetId}
      onGroupDragStart={onGroupDragStart}
      onGroupDrag={onGroupDrag}
      onGroupDragEnd={onGroupDragEnd}
      showResizeHandles={false}
      aspectRatioResizeMode={aspectRatioResizeModeForCanvasFile(entity.file)}
      shouldStartDrag={(event) => {
        if (canEdit && (isMarkdown || isVideo || isWireframe)) return false
        const target = event.target as HTMLElement | null
        if (target?.closest('button, textarea, input')) return false
        return true
      }}
    >
      <ContextMenu.Root>
        <ContextMenu.Trigger className="block" style={{ width: '100%', height: '100%' }}>
          {isVideo ? (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              <video
                src={filePathToSrc(entity.file)}
                autoPlay
                loop
                muted
                controls={canEdit}
                playsInline
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: entity.objectFit ?? 'contain',
                }}
              />
              {!canEdit && (
                <div style={{ position: 'absolute', inset: 0 }} />
              )}
            </div>
          ) : isImage ? (
            <img
              src={filePathToSrc(entity.file)}
              alt={fileName}
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: entity.objectFit ?? 'contain',
                pointerEvents: 'none',
              }}
            />
          ) : isMarkdown ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                overflow: 'auto',
                padding: 12,
              }}
            >
              {canEdit ? (
                <textarea
                  className="text-block-textarea w-full h-full resize-none border-none outline-none bg-transparent"
                  style={{
                    fontSize: 12,
                    color: isDark ? '#e7e5e4' : '#1c1917',
                    fontFamily: 'system-ui, sans-serif',
                  }}
                  value={localMdText}
                  placeholder="Write your note..."
                  onChange={(e) => handleMdTextChange(e.target.value)}
                  onFocus={() => { isFocusedRef.current = true; onTextEditingChange(true) }}
                  onBlur={() => {
                    isFocusedRef.current = false
                    onTextEditingChange(false)
                    if (debounceRef.current) {
                      clearTimeout(debounceRef.current)
                      debounceRef.current = null
                    }
                    fileApi.writeNoteFile(entity.file, localMdText)
                    setMdContent(localMdText)
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              ) : (
                <div
                  className="text-block-markdown"
                  style={{
                    fontSize: 12,
                    color: isDark ? '#e7e5e4' : '#1c1917',
                    fontFamily: 'system-ui, sans-serif',
                    wordBreak: 'break-word',
                  }}
                >
                  {mdContent != null ? (
                    mdContent ? <Markdown>{mdContent}</Markdown> : <span style={{ opacity: 0.4 }}>Write your note...</span>
                  ) : (
                    <span style={{ opacity: 0.4 }}>Loading...</span>
                  )}
                </div>
              )}
            </div>
          ) : isWireframe ? (
            wireframeContent != null ? (
              <div style={{ width: '100%', height: '100%', pointerEvents: canEdit ? 'auto' : 'none' }}>
                <WireframeRenderer
                  content={wireframeContent}
                  canEdit={canEdit}
                  jsonMode={wireframeJsonMode && canEdit}
                  onContentChange={handleWireframeChange}
                />
              </div>
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isDark ? '#a8a29e' : '#78716c',
                  fontSize: 13,
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                Loading...
              </div>
            )
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: 16,
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#a8a29e' : '#78716c'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span
                style={{
                  fontSize: 11,
                  color: isDark ? '#a8a29e' : '#78716c',
                  fontFamily: 'system-ui, sans-serif',
                  textAlign: 'center',
                  wordBreak: 'break-all',
                  maxWidth: '100%',
                }}
              >
                {fileName}
              </span>
            </div>
          )}
        </ContextMenu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={6}>
            <Menu.Popup className={menuPopupClass}>
              <Menu.Item className={menuItemClass} onClick={() => fileApi.showFileInFinder(entity.file)}>
                Show in Finder
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </ContextMenu.Root>
    </SelectableEntityShell>
  )
}

const MemoFileBlockCard = memo(FileBlockCard, (prev, next) => {
  return (
    prev.entity.id === next.entity.id &&
    prev.entity.file === next.entity.file &&
    prev.entity.subpath === next.entity.subpath &&
    prev.entity.canvasX === next.entity.canvasX &&
    prev.entity.canvasY === next.entity.canvasY &&
    prev.entity.width === next.entity.width &&
    prev.entity.height === next.entity.height &&
    prev.entity.objectFit === next.entity.objectFit &&
    prev.entity.showDeviceFrame === next.entity.showDeviceFrame &&
    prev.entity.deviceId === next.entity.deviceId &&
    prev.entity.deviceOrientation === next.entity.deviceOrientation &&
    prev.isDark === next.isDark &&
    prev.isSelected === next.isSelected &&
    prev.isMarqueePreview === next.isMarqueePreview &&
    prev.canEdit === next.canEdit &&
    prev.wireframeJsonMode === next.wireframeJsonMode &&
    prev.selectedGroupDragTargetId === next.selectedGroupDragTargetId
  )
})

/** Map of entityId → jsonMode, shared between FileChromeLayer and FileBlockLayer. */
export type FileJsonModeMap = Map<string, boolean>

export function FileBlockLayer({
  entities,
  getZoom,
  isDark,
  marqueePreviewIds,
  selectedEntityIdSet,
  selectedEntityCount,
  selectedGroupId,
  selectedGroupDescendantIds,
  jsonModeMap,
  onSelect,
  onResize,
  onTextEditingChange,
  onDragStart,
  onDrag,
  onDragEnd,
  onGroupDragStart,
  onGroupDrag,
  onGroupDragEnd,
}: {
  entities: CanvasSceneFileEntity[]
  getZoom: () => number
  isDark: boolean
  marqueePreviewIds: Set<string> | null
  selectedEntityIdSet: Set<string>
  selectedEntityCount: number
  selectedGroupId: string | null
  selectedGroupDescendantIds: Set<string>
  jsonModeMap: FileJsonModeMap
  onSelect: (id: string, modifiers?: SelectionModifiers) => void
  onResize: (id: string, patch: EntityResizePatch) => void
  onTextEditingChange: (active: boolean) => void
  onDragStart: (id: string) => void
  onDrag: (id: string, dx: number, dy: number) => void
  onDragEnd: () => void
  onGroupDragStart: (groupId: string) => void
  onGroupDrag: (groupId: string, dx: number, dy: number) => void
  onGroupDragEnd: () => void
}) {
  if (!entities.length) return null
  return (
    <>
      {entities.map((entity) => (
        <MemoFileBlockCard
          key={entity.id}
          getZoom={getZoom}
          isDark={isDark}
          isSelected={selectedEntityIdSet.has(entity.id)}
          isMarqueePreview={marqueePreviewIds?.has(entity.id) ?? false}
          canEdit={selectedEntityIdSet.has(entity.id) && selectedEntityCount === 1}
          wireframeJsonMode={jsonModeMap.get(entity.id) ?? false}
          entity={entity}
          selectedGroupDragTargetId={
            selectedGroupId && selectedGroupDescendantIds.has(entity.id)
              ? selectedGroupId
              : null
          }
          onDrag={onDrag}
          onDragEnd={onDragEnd}
          onDragStart={onDragStart}
          onGroupDrag={onGroupDrag}
          onGroupDragEnd={onGroupDragEnd}
          onGroupDragStart={onGroupDragStart}
          onResize={onResize}
          onSelect={onSelect}
          onTextEditingChange={onTextEditingChange}
        />
      ))}
    </>
  )
}
