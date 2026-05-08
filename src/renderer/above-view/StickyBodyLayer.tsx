/**
 * StickyBodyLayer — sticky-note (text entity) bodies. Mounted in aboveView
 * so a sticky placed over a frame is actually drawn above it.
 *
 * Hit-tests run in `useCanvasPointerRouter` against the layout snapshot
 * (front-to-back), so this layer is purely visual for selection/drag/resize.
 * The contenteditable textarea inside is the one exception — it needs real
 * DOM events, and works because the cards mount inside aboveView's WCV
 * which already holds keyboard focus during edit.
 */

import { memo, useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import type { CanvasSceneTextEntity } from '../../shared/types'
import { resolveCanvasColor } from '../../shared/canvas-colors'

/**
 * Wraps the sticky body cards in a viewport transform so they live in
 * canvas-coordinate space. AboveView's WCV origin already sits at
 * `canvasOrigin.y` (the toolbar inset), so the translate omits that axis
 * — only `canvasOrigin.x` and `pan` apply.
 */
function StickyViewportLayer({
  canvasOrigin,
  pan,
  zoom,
  children,
}: {
  canvasOrigin: { x: number; y: number }
  pan: { x: number; y: number }
  zoom: number
  children: React.ReactNode
}) {
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 origin-top-left"
      style={{
        ['--canvas-zoom' as string]: zoom,
        transform: `translate(${canvasOrigin.x + pan.x}px, ${pan.y}px) scale(${zoom})`,
      }}
    >
      {children}
    </div>
  )
}

function StickyShell({
  id,
  canvasX,
  canvasY,
  width,
  height,
  isDark,
  isSelected,
  background,
  textStyle,
  children,
}: {
  id: string
  canvasX: number
  canvasY: number
  width: number
  height: number
  isDark: boolean
  isSelected: boolean
  background: string
  textStyle: 'plain' | 'sticky'
  children: React.ReactNode
}) {
  const isPlain = textStyle === 'plain'
  return (
    <div
      data-entity-id={id}
      className="absolute pointer-events-auto"
      style={{
        left: canvasX,
        top: canvasY,
        width,
        height,
        background: isPlain ? 'transparent' : background,
        boxShadow: isPlain
          ? 'none'
          : isDark
            ? '0 2px 8px rgba(0, 0, 0, 0.3)'
            : '0 2px 8px rgba(0, 0, 0, 0.08)',
        overflow: isSelected ? 'visible' : 'hidden',
        cursor: 'default',
        touchAction: 'none',
      }}
    >
      {children}
    </div>
  )
}

function StickyCard({
  note,
  isDark,
  isSelected,
  canEdit,
  shouldAutoFocus,
  onAutoFocusConsumed,
  onUpdateText,
  onTextEditingChange,
}: {
  note: CanvasSceneTextEntity
  isDark: boolean
  isSelected: boolean
  canEdit: boolean
  shouldAutoFocus: boolean
  onAutoFocusConsumed: () => void
  onUpdateText: (id: string, text: string) => void
  onTextEditingChange: (active: boolean) => void
}) {
  const [localText, setLocalText] = useState(note.text)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFocusedRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    if (canEdit && shouldAutoFocus && textareaRef.current) {
      textareaRef.current.focus()
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
      onAutoFocusConsumed()
    }
  }, [canEdit, shouldAutoFocus, onAutoFocusConsumed])

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

  const textStyle = note.textStyle
  const isPlain = textStyle === 'plain'
  const textColor = isPlain ? (isDark ? '#f4f4f5' : '#18181b') : 'rgb(0, 0, 0)'
  const placeholder = isPlain ? 'Type some text...' : 'Type a note...'
  return (
    <StickyShell
      id={note.id}
      canvasX={note.canvasX}
      canvasY={note.canvasY}
      width={note.width}
      height={note.height}
      isDark={isDark}
      isSelected={isSelected}
      background={resolveCanvasColor(note.color)}
      textStyle={textStyle}
    >
      <div
        style={{
          width: note.width,
          height: note.height,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {!isPlain ? (
          <div
            style={{ minHeight: 8, cursor: 'grab' }}
            onMouseDown={(e) => {
              if (e.button !== 0) return
              e.stopPropagation()
            }}
          />
        ) : null}
        {canEdit ? (
          <textarea
            ref={textareaRef}
            className={`text-block-textarea flex-1 w-full resize-none border-none outline-none bg-transparent ${
              isPlain ? 'px-0 pb-0' : 'px-2.5 pb-2'
            }`}
            style={{
              boxSizing: 'border-box',
              fontSize: 12,
              color: textColor,
              fontFamily: 'system-ui, sans-serif',
              paddingTop: isPlain ? 0 : '0.3em',
            }}
            value={localText}
            placeholder={placeholder}
            onChange={(e) => handleTextChange(e.target.value)}
            onFocus={() => {
              isFocusedRef.current = true
              onTextEditingChange(true)
            }}
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
            className={`flex-1 select-none overflow-hidden text-block-markdown ${
              isPlain ? 'px-0 pb-0' : 'px-2 pb-2'
            }`}
            style={{
              fontSize: 12,
              color: textColor,
              fontFamily: 'system-ui, sans-serif',
              wordBreak: 'break-word',
            }}
          >
            {localText ? <Markdown>{localText}</Markdown> : <span>{placeholder}</span>}
          </div>
        )}
      </div>
    </StickyShell>
  )
}

const MemoStickyCard = memo(StickyCard, (prev, next) => {
  return (
    prev.note.id === next.note.id &&
    prev.note.text === next.note.text &&
    prev.note.color === next.note.color &&
    prev.note.textStyle === next.note.textStyle &&
    prev.note.canvasX === next.note.canvasX &&
    prev.note.canvasY === next.note.canvasY &&
    prev.note.width === next.note.width &&
    prev.note.height === next.note.height &&
    prev.isDark === next.isDark &&
    prev.isSelected === next.isSelected &&
    prev.canEdit === next.canEdit &&
    prev.shouldAutoFocus === next.shouldAutoFocus
  )
})

export function StickyBodyLayer({
  entities,
  isDark,
  selectedEntityIdSet,
  selectedEntityCount,
  pendingEditEntityId,
  canvasOrigin,
  pan,
  zoom,
  onPendingFocusConsumed,
  onUpdateText,
  onTextEditingChange,
}: {
  entities: CanvasSceneTextEntity[]
  isDark: boolean
  selectedEntityIdSet: Set<string>
  selectedEntityCount: number
  pendingEditEntityId: string | null
  canvasOrigin: { x: number; y: number }
  pan: { x: number; y: number }
  zoom: number
  onPendingFocusConsumed: () => void
  onUpdateText: (id: string, text: string) => void
  onTextEditingChange: (active: boolean) => void
}) {
  if (!entities.length) return null
  return (
    <StickyViewportLayer canvasOrigin={canvasOrigin} pan={pan} zoom={zoom}>
      {entities.map((note) => (
        <MemoStickyCard
          key={note.id}
          note={note}
          isDark={isDark}
          isSelected={selectedEntityIdSet.has(note.id)}
          canEdit={selectedEntityCount === 1 && selectedEntityIdSet.has(note.id)}
          shouldAutoFocus={pendingEditEntityId === note.id}
          onAutoFocusConsumed={onPendingFocusConsumed}
          onTextEditingChange={onTextEditingChange}
          onUpdateText={onUpdateText}
        />
      ))}
    </StickyViewportLayer>
  )
}

