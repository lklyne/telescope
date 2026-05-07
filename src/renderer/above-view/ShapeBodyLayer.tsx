/**
 * ShapeBodyLayer — shape (rectangle / ellipse / diamond) bodies, rendered in
 * aboveView (Phase C of the aboveView migration).
 *
 * The previous implementation lived in `canvas-bg/ShapeBlockLayer.tsx`, where
 * bodies painted under the page WCVs and could not be visible above frames.
 * They now mount in aboveView so a shape placed over a frame is actually
 * drawn above it.
 *
 * Hit-tests still happen in `useCanvasPointerRouter` against the layout
 * snapshot (front-to-back per Phase B′), so this layer is purely visual for
 * selection / drag / resize gestures. The contenteditable label inside is
 * the one place we *do* need real DOM events — those work because the cards
 * mount inside aboveView's WCV which already has keyboard focus during
 * text editing.
 */

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CanvasSceneShapeEntity } from '../../shared/types'
import { lightenHex, resolveCanvasColor, withAlpha } from '../../shared/canvas-colors'
import { CornerResizeHandle, EdgeResizeHandle } from '../canvas-bg/ResizeHandles'

const DEFAULT_STROKE_WIDTH = 2
const FILL_OPACITY = 0.24
const FILL_LIGHTEN = 0.5
const NEUTRAL_SLATE = '#6b7280'

/**
 * Wraps the shape cards in a viewport transform so they live in
 * canvas-coordinate space. AboveView's WCV origin already sits at
 * `canvasOrigin.y` (the toolbar inset), so the translate omits that axis
 * — only `canvasOrigin.x` and `pan` apply. Matches `StickyViewportLayer`.
 */
function ShapeViewportLayer({
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

  // Keep DOM textContent in sync with prop while not editing. Avoids
  // overwriting the user's in-flight typing. useLayoutEffect runs before
  // paint so the initial mount never shows an empty frame.
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

  // diamond: a true rhombus with vertices at the midpoints of each
  // bounding-box edge. Drawn as an SVG polygon so the stroke stays uniform
  // when the bounding box is non-square. The text box is the largest
  // axis-aligned rectangle that fits inside the rhombus — half the bbox
  // width × half the height.
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

function ShapeShell({
  id,
  canvasX,
  canvasY,
  width,
  height,
  isDark,
  isSelected,
  children,
}: {
  id: string
  canvasX: number
  canvasY: number
  width: number
  height: number
  isDark: boolean
  isSelected: boolean
  children: React.ReactNode
}) {
  // Shapes have no card background or shadow (transparent). The body
  // children paint the rectangle/ellipse/diamond fill themselves. Resize
  // handles stay visual-only; the router hit-tests against entity geometry.
  return (
    <div
      data-entity-id={id}
      className="absolute pointer-events-auto"
      style={{
        left: canvasX,
        top: canvasY,
        width,
        height,
        background: 'transparent',
        overflow: 'visible',
        cursor: 'default',
        touchAction: 'none',
      }}
    >
      {children}
      {isSelected ? (
        <>
          <EdgeResizeHandle edge="top" scaleWithZoom />
          <EdgeResizeHandle edge="right" scaleWithZoom />
          <EdgeResizeHandle edge="bottom" scaleWithZoom />
          <EdgeResizeHandle edge="left" scaleWithZoom />
          <CornerResizeHandle corner="top-left" isDark={isDark} scaleWithZoom />
          <CornerResizeHandle corner="top-right" isDark={isDark} scaleWithZoom />
          <CornerResizeHandle corner="bottom-left" isDark={isDark} scaleWithZoom />
          <CornerResizeHandle corner="bottom-right" isDark={isDark} scaleWithZoom />
        </>
      ) : null}
    </div>
  )
}

function ShapeCard({
  shape,
  isDark,
  isSelected,
  canEdit,
  pendingFocus,
  onUpdateText,
  onTextEditingChange,
  onPendingFocusConsumed,
}: {
  shape: CanvasSceneShapeEntity
  isDark: boolean
  isSelected: boolean
  canEdit: boolean
  pendingFocus: boolean
  onUpdateText: (id: string, text: string) => void
  onTextEditingChange: (active: boolean) => void
  onPendingFocusConsumed: () => void
}) {
  return (
    <ShapeShell
      id={shape.id}
      canvasX={shape.canvasX}
      canvasY={shape.canvasY}
      width={shape.width}
      height={shape.height}
      isDark={isDark}
      isSelected={isSelected}
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
    </ShapeShell>
  )
}

export function ShapeBodyLayer({
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
  entities: CanvasSceneShapeEntity[]
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
    <ShapeViewportLayer canvasOrigin={canvasOrigin} pan={pan} zoom={zoom}>
      {entities.map((shape) => (
        <ShapeCard
          key={shape.id}
          shape={shape}
          isDark={isDark}
          isSelected={selectedEntityIdSet.has(shape.id)}
          canEdit={selectedEntityCount === 1 && selectedEntityIdSet.has(shape.id)}
          pendingFocus={pendingEditEntityId === shape.id}
          onUpdateText={onUpdateText}
          onTextEditingChange={onTextEditingChange}
          onPendingFocusConsumed={onPendingFocusConsumed}
        />
      ))}
    </ShapeViewportLayer>
  )
}
