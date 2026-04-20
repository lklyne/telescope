import {
  type ButtonHTMLAttributes,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface EntityChromeContext {
  isDark: boolean
  showControls: boolean
}

const ChromeCtx = createContext<EntityChromeContext>({
  isDark: false,
  showControls: true,
})

// ---------------------------------------------------------------------------
// EntityChrome.Root — two positioning modes:
//   • inline: anchored at a canvas position, floats above its frame via translateY(-100%).
//     No background; controls hidden until hover/active.
//   • pinned: fixed at top of viewport for a focused entity. Opaque background,
//             height matches toolbar (44px), controls always visible.
// ---------------------------------------------------------------------------

export type EntityChromePositioning =
  | {
      mode: 'inline'
      screenX: number
      screenY: number
      screenWidth: number
    }
  | {
      mode: 'pinned'
      topY: number
      leftX: number
      width: number
      height: number
    }

function Root({
  positioning,
  isDark,
  dragEnabled = true,
  isActive,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  positioning: EntityChromePositioning
  isDark: boolean
  dragEnabled?: boolean
  isActive: boolean
  onMouseDown?: (e: React.MouseEvent) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  children: ReactNode
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [showControls, setShowControls] = useState(isActive || positioning.mode === 'pinned')
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pinned chrome always shows its controls. Inline chrome fades on hover/active.
  const controlsAlwaysVisible = positioning.mode === 'pinned'
  const isHoveredOrActive = isActive || isHovered

  useEffect(() => {
    if (controlsAlwaysVisible) {
      setShowControls(true)
      return
    }
    if (isHoveredOrActive) {
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
      setShowControls(true)
    } else {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 150)
    }
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
  }, [isHoveredOrActive, controlsAlwaysVisible])

  if (positioning.mode === 'pinned') {
    return (
      <ChromeCtx.Provider value={{ isDark, showControls: true }}>
        <div
          className={`pointer-events-auto absolute rounded-md border backdrop-blur-md ${
            isDark
              ? 'border-zinc-700 bg-zinc-900/85 text-zinc-100'
              : 'border-zinc-200 bg-white/90 text-zinc-900'
          }`}
          data-overlay-ui
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          style={{
            left: positioning.leftX,
            top: positioning.topY,
            width: positioning.width,
            height: positioning.height,
          }}
        >
          <div
            className="flex h-full w-full items-center gap-1 px-2"
            onMouseDown={onMouseDown}
          >
            {children}
          </div>
        </div>
      </ChromeCtx.Provider>
    )
  }

  return (
    <ChromeCtx.Provider value={{ isDark, showControls }}>
      <div
        className="pointer-events-auto absolute"
        data-overlay-ui
        onMouseEnter={() => { setIsHovered(true); onMouseEnter?.() }}
        onMouseLeave={() => { setIsHovered(false); onMouseLeave?.() }}
        style={{
          left: positioning.screenX,
          top: positioning.screenY,
          width: positioning.screenWidth,
          transform: 'translateY(-100%)',
          pointerEvents: dragEnabled ? 'auto' : 'none',
        }}
      >
        <div
          className="flex w-full items-center gap-1 py-1 text-zinc-900 dark:text-zinc-100"
          onMouseDown={onMouseDown}
        >
          {children}
        </div>
      </div>
    </ChromeCtx.Provider>
  )
}

// ---------------------------------------------------------------------------
// EntityChrome.DragTrigger
// ---------------------------------------------------------------------------

function DragTrigger({
  children,
  onMouseDown,
}: {
  children: ReactNode
  onMouseDown?: (e: React.MouseEvent) => void
}) {
  const { isDark } = useContext(ChromeCtx)
  return (
    <div
      data-frame-drag-trigger
      className={`flex h-7 min-w-0 flex-1 cursor-grab items-center gap-1.5 rounded-[7px] border border-transparent px-1.5 text-xs select-none active:cursor-grabbing ${
        isDark ? 'text-zinc-300' : 'text-zinc-700'
      }`}
      onMouseDown={onMouseDown}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// EntityChrome.Title
// ---------------------------------------------------------------------------

function Title({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <span
      className={`min-w-0 truncate font-medium ${onClick ? 'cursor-text' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// EntityChrome.Actions — visible only when showControls is true
// ---------------------------------------------------------------------------

function Actions({ children }: { children: ReactNode }) {
  const { showControls } = useContext(ChromeCtx)
  if (!showControls) return null
  return (
    <div
      className="flex shrink-0 items-center"
      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// EntityChrome.Button
// ---------------------------------------------------------------------------

function Button({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) {
  const { isDark } = useContext(ChromeCtx)
  return (
    <button
      type="button"
      {...props}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] transition-colors ${
        isDark
          ? 'text-zinc-400 hover:bg-zinc-700/70 hover:text-zinc-100'
          : 'text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-900'
      } ${props.className ?? ''}`}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const EntityChrome = { Root, DragTrigger, Title, Actions, Button }
