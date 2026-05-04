import { memo, useEffect, useRef, useState } from 'react'
import type { CanvasSceneShapeEntity, SelectionModifiers } from '../../shared/types'
import { resolveCanvasColor } from '../../shared/canvas-colors'
import { SelectableEntityShell } from './SelectableEntityShell'
import type { EntityResizePatch } from './entityConstants'
import { MIN_SHAPE_WIDTH, MIN_SHAPE_HEIGHT } from './entityConstants'

const DEFAULT_STROKE_WIDTH = 2

function neutralStroke(isDark: boolean): string {
  return isDark ? 'hsl(0 0% 50%)' : 'hsl(0 0% 60%)'
}

function fillFromColor(color: string | undefined): string {
  if (!color) return 'transparent'
  const resolved = resolveCanvasColor(color)
  return resolved
}

function strokeFromColor(color: string | undefined, isDark: boolean): string {
  if (!color) return neutralStroke(isDark)
  const resolved = resolveCanvasColor(color)
  return resolved
}

function ShapeBody({
  shape,
  isDark,
  pendingFocus,
  onCommitText,
  onTextEditingChange,
  onRequestEdit,
  onPendingFocusConsumed,
  canEdit,
  selected,
}: {
  shape: CanvasSceneShapeEntity
  isDark: boolean
  pendingFocus: boolean
  onCommitText: (text: string) => void
  onTextEditingChange: (active: boolean) => void
  onRequestEdit: () => void
  onPendingFocusConsumed: () => void
  canEdit: boolean
  selected: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [localText, setLocalText] = useState(shape.text)
  const isFocusedRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!isFocusedRef.current) setLocalText(shape.text)
  }, [shape.text])

  useEffect(() => {
    if (pendingFocus && canEdit) {
      setEditing(true)
      onPendingFocusConsumed()
    }
  }, [canEdit, onPendingFocusConsumed, pendingFocus])

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [editing])

  useEffect(() => {
    if (!canEdit && editing) {
      setEditing(false)
      isFocusedRef.current = false
      onTextEditingChange(false)
    }
  }, [canEdit, editing, onTextEditingChange])

  const stroke = shape.strokeWidth ?? DEFAULT_STROKE_WIDTH
  const fill = fillFromColor(shape.color)
  const strokeColor = strokeFromColor(shape.color, isDark)
  const textColor = isDark && !shape.color ? 'rgb(220, 220, 220)' : 'rgb(20, 20, 20)'

  const baseStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    borderWidth: stroke,
    borderStyle: 'solid',
    borderColor: strokeColor,
    backgroundColor: fill,
    pointerEvents: 'none',
  }

  const textWrapperStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  }

  const innerTextStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    fontSize: 13,
    color: textColor,
    fontFamily: 'system-ui, sans-serif',
    textAlign: 'center',
    overflow: 'hidden',
    wordBreak: 'break-word',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    resize: 'none',
    padding: 0,
    pointerEvents: editing ? 'auto' : 'none',
  }

  const handleStartEdit = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onRequestEdit()
    if (canEdit) setEditing(true)
  }

  const renderText = () => (
    <div style={textWrapperStyle} onDoubleClick={handleStartEdit}>
      {editing ? (
        <textarea
          ref={textareaRef}
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onFocus={() => {
            isFocusedRef.current = true
            onTextEditingChange(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              ;(e.target as HTMLTextAreaElement).blur()
            }
          }}
          onBlur={() => {
            isFocusedRef.current = false
            onTextEditingChange(false)
            setEditing(false)
            onCommitText(localText)
          }}
          style={{
            ...innerTextStyle,
            display: 'flex',
            textAlign: 'center',
          }}
        />
      ) : (
        <div
          style={{
            ...innerTextStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            whiteSpace: 'pre-wrap',
            userSelect: 'none',
          }}
        >
          {localText}
        </div>
      )}
    </div>
  )

  if (shape.shapeKind === 'rectangle') {
    return (
      <>
        <div style={baseStyle} />
        {renderText()}
      </>
    )
  }

  if (shape.shapeKind === 'ellipse') {
    return (
      <>
        <div style={{ ...baseStyle, borderRadius: '50%' }} />
        {renderText()}
      </>
    )
  }

  // diamond: rotate the silhouette square 45deg, place a counter-rotated text box inscribed inside.
  // Inscribed-rectangle dimensions for a 45° rotation are width / sqrt(2), height / sqrt(2).
  const inscribedRatio = 1 / Math.SQRT2
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width: `${inscribedRatio * 100}%`,
            height: `${inscribedRatio * 100}%`,
            transform: 'rotate(45deg)',
            transformOrigin: 'center',
            borderWidth: stroke,
            borderStyle: 'solid',
            borderColor: strokeColor,
            backgroundColor: fill,
            boxSizing: 'border-box',
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: `${inscribedRatio * 100}%`,
          height: `${inscribedRatio * 100}%`,
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          boxSizing: 'border-box',
        }}
        onDoubleClick={handleStartEdit}
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            value={localText}
            onChange={(e) => setLocalText(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onFocus={() => {
              isFocusedRef.current = true
              onTextEditingChange(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                ;(e.target as HTMLTextAreaElement).blur()
              }
            }}
            onBlur={() => {
              isFocusedRef.current = false
              onTextEditingChange(false)
              setEditing(false)
              onCommitText(localText)
            }}
            style={{
              ...innerTextStyle,
              textAlign: 'center',
            }}
          />
        ) : (
          <div
            style={{
              ...innerTextStyle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              whiteSpace: 'pre-wrap',
              userSelect: 'none',
            }}
          >
            {localText}
          </div>
        )}
      </div>
    </>
  )
}

const MemoShapeBody = memo(ShapeBody, (a, b) => {
  return (
    a.shape.id === b.shape.id &&
    a.shape.shapeKind === b.shape.shapeKind &&
    a.shape.text === b.shape.text &&
    a.shape.color === b.shape.color &&
    a.shape.strokeWidth === b.shape.strokeWidth &&
    a.shape.width === b.shape.width &&
    a.shape.height === b.shape.height &&
    a.isDark === b.isDark &&
    a.pendingFocus === b.pendingFocus &&
    a.canEdit === b.canEdit &&
    a.selected === b.selected
  )
})

function ShapeCard({
  shape,
  isDark,
  isSelected,
  isMarqueePreview,
  canEdit,
  pendingFocus,
  selectedGroupDragTargetId,
  onSelect,
  onResize,
  onUpdateText,
  onTextEditingChange,
  onRequestEdit,
  onPendingFocusConsumed,
  onDragStart,
  onDrag,
  onDragEnd,
  onGroupDragStart,
  onGroupDrag,
  onGroupDragEnd,
  getZoom,
}: {
  shape: CanvasSceneShapeEntity
  isDark: boolean
  isSelected: boolean
  isMarqueePreview: boolean
  canEdit: boolean
  pendingFocus: boolean
  selectedGroupDragTargetId?: string | null
  onSelect: (id: string, modifiers?: SelectionModifiers) => void
  onResize: (id: string, patch: EntityResizePatch) => void
  onUpdateText: (id: string, text: string) => void
  onTextEditingChange: (active: boolean) => void
  onRequestEdit: (id: string) => void
  onPendingFocusConsumed: () => void
  onDragStart: (id: string) => void
  onDrag: (id: string, dx: number, dy: number) => void
  onDragEnd: () => void
  onGroupDragStart: (groupId: string) => void
  onGroupDrag: (groupId: string, dx: number, dy: number) => void
  onGroupDragEnd: () => void
  getZoom: () => number
}) {
  return (
    <SelectableEntityShell
      id={shape.id}
      canvasX={shape.canvasX}
      canvasY={shape.canvasY}
      width={shape.width}
      height={shape.height}
      getZoom={getZoom}
      minWidth={MIN_SHAPE_WIDTH}
      minHeight={MIN_SHAPE_HEIGHT}
      isDark={isDark}
      isSelected={isSelected}
      isMarqueePreview={isMarqueePreview}
      background="transparent"
      showCardShadow={false}
      onSelect={onSelect}
      onDoubleClick={(entityId, event) => {
        event.preventDefault()
        event.stopPropagation()
        onRequestEdit(entityId)
      }}
      onResize={onResize}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      selectedGroupDragTargetId={selectedGroupDragTargetId}
      onGroupDragStart={onGroupDragStart}
      onGroupDrag={onGroupDrag}
      onGroupDragEnd={onGroupDragEnd}
      shouldStartDrag={(event) => {
        const target = event.target as HTMLElement | null
        if (target?.closest('textarea')) return false
        return true
      }}
      overflowVisible
    >
      <MemoShapeBody
        shape={shape}
        isDark={isDark}
        canEdit={canEdit}
        selected={isSelected}
        pendingFocus={pendingFocus}
        onCommitText={(text) => onUpdateText(shape.id, text)}
        onTextEditingChange={onTextEditingChange}
        onRequestEdit={() => onRequestEdit(shape.id)}
        onPendingFocusConsumed={onPendingFocusConsumed}
      />
    </SelectableEntityShell>
  )
}

export function ShapeBlockLayer({
  entities,
  getZoom,
  isDark,
  marqueePreviewIds,
  selectedEntityIdSet,
  selectedEntityCount,
  selectedGroupId,
  selectedGroupDescendantIds,
  pendingEditEntityId,
  onSelect,
  onUpdateText,
  onResize,
  onTextEditingChange,
  onRequestEdit,
  onPendingFocusConsumed,
  onDragStart,
  onDrag,
  onDragEnd,
  onGroupDragStart,
  onGroupDrag,
  onGroupDragEnd,
}: {
  entities: CanvasSceneShapeEntity[]
  getZoom: () => number
  isDark: boolean
  marqueePreviewIds: Set<string> | null
  selectedEntityIdSet: Set<string>
  selectedEntityCount: number
  selectedGroupId: string | null
  selectedGroupDescendantIds: Set<string>
  pendingEditEntityId: string | null
  onSelect: (id: string, modifiers?: SelectionModifiers) => void
  onUpdateText: (id: string, text: string) => void
  onResize: (id: string, patch: EntityResizePatch) => void
  onTextEditingChange: (active: boolean) => void
  onRequestEdit: (id: string) => void
  onPendingFocusConsumed: () => void
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
      {entities.map((shape) => (
        <ShapeCard
          key={shape.id}
          shape={shape}
          getZoom={getZoom}
          isDark={isDark}
          isSelected={selectedEntityIdSet.has(shape.id)}
          isMarqueePreview={marqueePreviewIds?.has(shape.id) ?? false}
          canEdit={selectedEntityCount === 1 && selectedEntityIdSet.has(shape.id)}
          pendingFocus={pendingEditEntityId === shape.id}
          selectedGroupDragTargetId={
            selectedGroupId && selectedGroupDescendantIds.has(shape.id)
              ? selectedGroupId
              : null
          }
          onSelect={onSelect}
          onResize={onResize}
          onUpdateText={onUpdateText}
          onTextEditingChange={onTextEditingChange}
          onRequestEdit={onRequestEdit}
          onPendingFocusConsumed={onPendingFocusConsumed}
          onDragStart={onDragStart}
          onDrag={onDrag}
          onDragEnd={onDragEnd}
          onGroupDragStart={onGroupDragStart}
          onGroupDrag={onGroupDrag}
          onGroupDragEnd={onGroupDragEnd}
        />
      ))}
    </>
  )
}
