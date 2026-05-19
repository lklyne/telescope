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
  showControls: false,
})

// ---------------------------------------------------------------------------
// EntityChrome.Root
// ---------------------------------------------------------------------------

function Root({
  screenX,
  screenY,
  screenWidth,
  isDark,
  dragEnabled = true,
  isActive,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  children,
}: {
  screenX: number
  screenY: number
  screenWidth: number
  isDark: boolean
  dragEnabled?: boolean
  isActive: boolean
  onPointerDown?: (e: React.PointerEvent) => void
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  children: ReactNode
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [showControls, setShowControls] = useState(isActive)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isHoveredOrActive = isActive || isHovered

  useEffect(() => {
    if (isHoveredOrActive) {
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
      setShowControls(true)
    } else {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 150)
    }
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
  }, [isHoveredOrActive])

  return (
    <ChromeCtx.Provider value={{ isDark, showControls }}>
      <div
        className="pointer-events-auto absolute"
        data-overlay-ui
        onPointerEnter={() => { setIsHovered(true); onPointerEnter?.() }}
        onPointerLeave={() => { setIsHovered(false); onPointerLeave?.() }}
        style={{
          left: screenX,
          top: screenY,
          width: screenWidth,
          transform: 'translateY(-100%)',
          pointerEvents: dragEnabled ? 'auto' : 'none',
        }}
      >
        <div
          className="flex w-full items-center gap-1 py-1 text-zinc-900 dark:text-zinc-100"
          onPointerDown={onPointerDown}
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
  onPointerDown,
}: {
  children: ReactNode
  onPointerDown?: (e: React.PointerEvent) => void
}) {
  const { isDark } = useContext(ChromeCtx)
  return (
    <div
      data-page-drag-trigger
      className={`flex h-7 min-w-0 flex-1 cursor-grab items-center gap-1.5 rounded-[7px] border border-transparent px-1.5 text-xs select-none active:cursor-grabbing ${
        isDark ? 'text-zinc-300' : 'text-zinc-700'
      }`}
      onPointerDown={onPointerDown}
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
      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault() }}
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
