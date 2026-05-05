import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CanvasSceneShapeEntity, SelectionModifiers } from '../../shared/types'
import { lightenHex, resolveCanvasColor, withAlpha } from '../../shared/canvas-colors'
import { SelectableEntityShell } from './SelectableEntityShell'
import type { EntityResizePatch } from './entityConstants'
import { MIN_SHAPE_WIDTH, MIN_SHAPE_HEIGHT } from './entityConstants'

const DEFAULT_STROKE_WIDTH = 2
const FILL_OPACITY = 0.24
const FILL_LIGHTEN = 0.5
const NEUTRAL_SLATE = '#6b7280'

function ShapeText({
  text,
  editing,
  textColor,
  onChange,
  onStartEditing,
  onStopEditing,
  onCommit,
  containerStyle,
}: {
  text: string
  editing: boolean
  textColor: string
  onChange: (value: string) => void
  onStartEditing: () => void
  onStopEditing: () => void
  onCommit: (value: string) => void
  containerStyle: React.CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Keep DOM textContent in sync with prop while not editing. Avoids overwriting
  // the user's in-flight typing. useLayoutEffect runs before paint so the
  // initial mount never shows an empty frame.
  useLayoutEffect(() => {
    if (!editing && ref.current && ref.current.textContent !== text) {
      ref.current.textContent = text
    }
  }, [text, editing])

  // On entering edit mode, focus and select all.
  useEffect(() => {
    const node = ref.current
    if (!editing || !node) return
    node.focus()
    const range = document.createRange()
    range.selectNodeContents(node)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [editing])

  return (
    <div style={containerStyle}>
      <div
        ref={ref}
        contentEditable={editing}
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).textContent ?? '')}
        onMouseDown={(e) => { if (editing) e.stopPropagation() }}
        onPointerDown={(e) => { if (editing) e.stopPropagation() }}
        onFocus={onStartEditing}
        onBlur={(e) => {
          onStopEditing()
          onCommit((e.target as HTMLDivElement).textContent ?? '')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            ;(e.target as HTMLDivElement).blur()
          }
        }}
        style={{
          width: '100%',
          maxHeight: '100%',
          fontSize: 13,
          lineHeight: 1.4,
          color: textColor,
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          overflow: 'hidden',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          outline: 'none',
          userSelect: editing ? 'text' : 'none',
          pointerEvents: editing ? 'auto' : 'none',
          cursor: editing ? 'text' : 'inherit',
        }}
      />
    </div>
  )
}

function ShapeBody({
  shape,
  isDark,
  pendingFocus,
  onCommitText,
  onTextEditingChange,
  onPendingFocusConsumed,
  canEdit,
}: {
  shape: CanvasSceneShapeEntity
  isDark: boolean
  pendingFocus: boolean
  onCommitText: (text: string) => void
  onTextEditingChange: (active: boolean) => void
  onPendingFocusConsumed: () => void
  canEdit: boolean
  selected: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [localText, setLocalText] = useState(shape.text)
  const isFocusedRef = useRef(false)

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
    if (!canEdit && editing) {
      setEditing(false)
      isFocusedRef.current = false
      onTextEditingChange(false)
    }
  }, [canEdit, editing, onTextEditingChange])

  const stroke = shape.strokeWidth ?? DEFAULT_STROKE_WIDTH
  const resolvedColor = shape.color ? resolveCanvasColor(shape.color) : NEUTRAL_SLATE
  const fill = withAlpha(lightenHex(resolvedColor, FILL_LIGHTEN), FILL_OPACITY)
  const strokeColor = resolvedColor
  const textColor = isDark ? 'rgb(220, 220, 220)' : 'rgb(20, 20, 20)'

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

  const textContainerStyle: React.CSSProperties =
    shape.shapeKind === 'diamond'
      ? {
          position: 'absolute',
          left: '25%',
          top: '25%',
          width: '50%',
          height: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          boxSizing: 'border-box',
          pointerEvents: editing ? 'auto' : 'none',
        }
      : {
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          pointerEvents: editing ? 'auto' : 'none',
        }

  const text = (
    <ShapeText
      text={localText}
      editing={editing}
      textColor={textColor}
      containerStyle={textContainerStyle}
      onChange={setLocalText}
      onStartEditing={() => {
        isFocusedRef.current = true
        onTextEditingChange(true)
      }}
      onStopEditing={() => {
        isFocusedRef.current = false
        onTextEditingChange(false)
        setEditing(false)
      }}
      onCommit={(value) => {
        setLocalText(value)
        onCommitText(value)
      }}
    />
  )

  if (shape.shapeKind === 'rectangle') {
    return (
      <>
        <div style={baseStyle} />
        {text}
      </>
    )
  }

  if (shape.shapeKind === 'ellipse') {
    return (
      <>
        <div style={{ ...baseStyle, borderRadius: '50%' }} />
        {text}
      </>
    )
  }

  // diamond: a true rhombus with vertices at the midpoints of each bounding-box
  // edge. Drawn as an SVG polygon so the stroke stays uniform when the bounding
  // box is non-square. The text box is the largest axis-aligned rectangle that
  // fits inside the rhombus — which is half the bbox width × half the height.
  return (
    <>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
      >
        <polygon
          points="50,0 100,50 50,100 0,50"
          fill={fill}
          stroke={strokeColor}
          strokeWidth={stroke}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {text}
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
        if (target?.closest('[contenteditable="true"]')) return false
        return true
      }}
      aspectRatioResizeMode="shift-locks"
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
