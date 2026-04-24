import { memo, useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import type { CanvasSceneTextEntity, SelectionModifiers } from '../../shared/types'
import { resolveCanvasColor } from '../../shared/canvas-colors'
import { SelectableEntityShell } from './SelectableEntityShell'
import type { EntityResizePatch } from './entityConstants'
import { MIN_TEXT_WIDTH, MIN_TEXT_HEIGHT } from './entityConstants'

function TextBlockCard({
  note,
  getZoom,
  isDark,
  isSelected,
  isMarqueePreview,
  canEdit,
  onSelect,
  onUpdateText,
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
  note: CanvasSceneTextEntity
  getZoom: () => number
  isDark: boolean
  isSelected: boolean
  isMarqueePreview: boolean
  canEdit: boolean
  onSelect: (id: string, modifiers?: SelectionModifiers) => void
  onUpdateText: (id: string, text: string) => void
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
  const [localText, setLocalText] = useState(note.text)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFocusedRef = useRef(false)

  // Sync from props when not actively editing
  useEffect(() => {
    if (!isFocusedRef.current) {
      setLocalText(note.text)
    }
  }, [note.text])

  // Clear text editing state when edit mode is lost (e.g. multi-select or deletion)
  useEffect(() => {
    if (!canEdit && isFocusedRef.current) {
      isFocusedRef.current = false
      onTextEditingChange(false)
    }
  }, [canEdit, onTextEditingChange])

  const handleTextChange = (value: string) => {
    setLocalText(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onUpdateText(note.id, value)
    }, 300)
  }

  return (
    <SelectableEntityShell
      id={note.id}
      canvasX={note.canvasX}
      canvasY={note.canvasY}
      width={note.width}
      height={note.height}
      getZoom={getZoom}
      minWidth={MIN_TEXT_WIDTH}
      minHeight={MIN_TEXT_HEIGHT}
      isDark={isDark}
      isSelected={isSelected}
      isMarqueePreview={isMarqueePreview}
      background={resolveCanvasColor(note.color)}
      onSelect={onSelect}
      onResize={onResize}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      selectedGroupDragTargetId={selectedGroupDragTargetId}
      onGroupDragStart={onGroupDragStart}
      onGroupDrag={onGroupDrag}
      onGroupDragEnd={onGroupDragEnd}
      shouldStartDrag={(event) => {
        if (canEdit) return false
        const target = event.target as HTMLElement | null
        if (target?.closest('button, textarea')) return false
        return true
      }}
    >
      <div
        style={{
          width: note.width,
          height: note.height,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{ minHeight: 8, cursor: 'grab' }}
          onMouseDown={(e) => {
            if (e.button !== 0) return
            e.stopPropagation()
          }}
        />
        {canEdit ? (
          <textarea
            className="text-block-textarea flex-1 w-full resize-none border-none outline-none bg-transparent px-2.5 pb-2"
            style={{
              boxSizing: 'border-box',
              fontSize: 12,
              color: 'rgb(0, 0, 0)',
              fontFamily: 'system-ui, sans-serif',
              paddingTop: '0.3em',
            }}
            value={localText}
            placeholder="Type a note..."
            onChange={(e) => handleTextChange(e.target.value)}
            onFocus={() => { isFocusedRef.current = true; onTextEditingChange(true) }}
            onBlur={() => {
              isFocusedRef.current = false
              onTextEditingChange(false)
              if (debounceRef.current) {
                clearTimeout(debounceRef.current)
                debounceRef.current = null
              }
              onUpdateText(note.id, localText)
            }}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            className="flex-1 select-none overflow-hidden px-2 pb-2 text-block-markdown"
            style={{
              fontSize: 12,
              color: 'rgb(0, 0, 0)',
              fontFamily: 'system-ui, sans-serif',
              wordBreak: 'break-word',
            }}
          >
            {localText ? <Markdown>{localText}</Markdown> : <span>Type a note...</span>}
          </div>
        )}
      </div>
    </SelectableEntityShell>
  )
}

const MemoTextBlockCard = memo(TextBlockCard, (prev, next) => {
  return (
    prev.note.id === next.note.id &&
    prev.note.text === next.note.text &&
    prev.note.color === next.note.color &&
    prev.note.canvasX === next.note.canvasX &&
    prev.note.canvasY === next.note.canvasY &&
    prev.note.width === next.note.width &&
    prev.note.height === next.note.height &&
    prev.isDark === next.isDark &&
    prev.isSelected === next.isSelected &&
    prev.isMarqueePreview === next.isMarqueePreview &&
    prev.canEdit === next.canEdit &&
    prev.selectedGroupDragTargetId === next.selectedGroupDragTargetId
  )
})

export function TextBlockLayer({
  entities,
  getZoom,
  isDark,
  marqueePreviewIds,
  selectedEntityIdSet,
  selectedEntityCount,
  selectedGroupId,
  selectedGroupDescendantIds,
  onSelect,
  onUpdateText,
  onResize,
  onTextEditingChange,
  onDragStart,
  onDrag,
  onDragEnd,
  onGroupDragStart,
  onGroupDrag,
  onGroupDragEnd,
}: {
  entities: CanvasSceneTextEntity[]
  getZoom: () => number
  isDark: boolean
  marqueePreviewIds: Set<string> | null
  selectedEntityIdSet: Set<string>
  selectedEntityCount: number
  selectedGroupId: string | null
  selectedGroupDescendantIds: Set<string>
  onSelect: (id: string, modifiers?: SelectionModifiers) => void
  onUpdateText: (id: string, text: string) => void
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
      {entities.map((note) => (
        <MemoTextBlockCard
          key={note.id}
          getZoom={getZoom}
          isDark={isDark}
          isSelected={selectedEntityIdSet.has(note.id)}
          isMarqueePreview={marqueePreviewIds?.has(note.id) ?? false}
          canEdit={selectedEntityCount === 1 && selectedEntityIdSet.has(note.id)}
          note={note}
          selectedGroupDragTargetId={
            selectedGroupId && selectedGroupDescendantIds.has(note.id)
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
          onUpdateText={onUpdateText}
        />
      ))}
    </>
  )
}
