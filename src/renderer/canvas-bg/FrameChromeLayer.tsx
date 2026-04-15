import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, EllipsisVertical, RotateCw, Search } from 'lucide-react'
import type { CanvasSceneFrameEntity } from '../../shared/types'
import { normalizeUserUrl } from '../../shared/url'
import { EntityChrome } from './EntityChromeHeader'

export function FrameChromeLayer({
  frames,
  dragEnabled,
  isDark,
  selectedFrameId,
  hoveredFrameId,
  isIdle,
  handleChromeMouseDown,
  onHoverFrame,
  onNavigateFrame,
  onGoBackFrame,
  onGoForwardFrame,
  onReloadFrame,
  onShowContextMenu,
}: {
  frames: CanvasSceneFrameEntity[]
  dragEnabled: boolean
  isDark: boolean
  selectedFrameId: string | null
  hoveredFrameId: string | null
  isIdle: boolean
  handleChromeMouseDown: (frameId: string, event: React.MouseEvent | MouseEvent) => void
  onHoverFrame: (frameId: string | null) => void
  onNavigateFrame: (frameId: string, url: string) => void
  onGoBackFrame: (frameId: string) => void
  onGoForwardFrame: (frameId: string) => void
  onReloadFrame: (frameId: string) => void
  onShowContextMenu: (frameId: string) => void
}) {
  return (
    <>
      {frames.map((frame) => {
        const isSelected = frame.id === selectedFrameId && isIdle
        const isHovered = frame.id === hoveredFrameId
        return (
          <FrameChromeItem
            key={frame.id}
            frame={frame}
            isDark={isDark}
            dragEnabled={dragEnabled}
            isSelected={isSelected}
            isActive={isSelected || isHovered}
            handleChromeMouseDown={handleChromeMouseDown}
            onHoverFrame={onHoverFrame}
            onNavigateFrame={onNavigateFrame}
            onGoBackFrame={onGoBackFrame}
            onGoForwardFrame={onGoForwardFrame}
            onReloadFrame={onReloadFrame}
            onShowContextMenu={onShowContextMenu}
          />
        )
      })}
    </>
  )
}

function FrameChromeItem({
  frame,
  isDark,
  dragEnabled,
  isSelected,
  isActive,
  handleChromeMouseDown,
  onHoverFrame,
  onNavigateFrame,
  onGoBackFrame,
  onGoForwardFrame,
  onReloadFrame,
  onShowContextMenu,
}: {
  frame: CanvasSceneFrameEntity
  isDark: boolean
  dragEnabled: boolean
  isSelected: boolean
  isActive: boolean
  handleChromeMouseDown: (frameId: string, event: React.MouseEvent | MouseEvent) => void
  onHoverFrame: (frameId: string | null) => void
  onNavigateFrame: (frameId: string, url: string) => void
  onGoBackFrame: (frameId: string) => void
  onGoForwardFrame: (frameId: string) => void
  onReloadFrame: (frameId: string) => void
  onShowContextMenu: (frameId: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [addressValue, setAddressValue] = useState(frame.url)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isBlank = frame.url === 'about:blank' && !pendingUrl

  useEffect(() => {
    setAddressValue(frame.url)
    setPendingUrl(null)
  }, [frame.url])

  useEffect(() => {
    if (isEditing) {
      if (isBlank) setAddressValue('')
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  // Reset editing when becoming inactive
  useEffect(() => {
    if (!isActive && isEditing) {
      setIsEditing(false)
      setAddressValue(frame.url)
    }
  }, [isActive, isEditing, frame.url])

  const handleCommitUrl = () => {
    const value = addressValue.trim()
    if (value && value !== frame.url) {
      const normalized = normalizeUserUrl(value)
      setPendingUrl(normalized)
      onNavigateFrame(frame.id, normalized)
    }
    setIsEditing(false)
  }

  const faviconIcon = isBlank ? (
    <Search size={13} className="shrink-0 text-zinc-400" />
  ) : frame.faviconUrl ? (
    <img alt="" aria-hidden="true" src={frame.faviconUrl} className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
  ) : null

  return (
    <EntityChrome.Root
      screenX={frame.showDeviceFrame ? frame.screenX : (frame.contentScreenX ?? frame.screenX)}
      screenY={frame.screenY}
      screenWidth={frame.showDeviceFrame ? frame.screenWidth : (frame.contentScreenWidth ?? frame.screenWidth)}
      isDark={isDark}
      dragEnabled={dragEnabled}
      isActive={isActive}
      onMouseDown={!isEditing ? (event) => {
        const target = event.target as HTMLElement
        if (target.closest('[data-frame-context-menu]')) return
        handleChromeMouseDown(frame.id, event)
      } : undefined}
      onMouseEnter={() => onHoverFrame(frame.id)}
      onMouseLeave={() => onHoverFrame(null)}
    >
      {isEditing ? (
        <EntityChrome.DragTrigger onMouseDown={(e) => e.stopPropagation()}>
          {faviconIcon}
          <input
            ref={inputRef}
            type="text"
            value={addressValue}
            onChange={(event) => setAddressValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleCommitUrl()
              if (event.key === 'Escape') {
                setAddressValue(frame.url)
                setIsEditing(false)
              }
            }}
            onBlur={handleCommitUrl}
            placeholder={isBlank ? 'Type a URL' : frame.url}
            spellCheck={false}
            className="min-w-0 flex-1 border-0 bg-transparent text-xs font-medium outline-none placeholder:text-zinc-400 focus:outline-none"
          />
        </EntityChrome.DragTrigger>
      ) : (
        <EntityChrome.DragTrigger>
          {faviconIcon}
          <EntityChrome.Title
            onClick={isSelected ? () => setIsEditing(true) : undefined}
            className={isBlank ? 'text-zinc-400' : ''}
          >
            {isBlank ? 'Type a URL' : (frame.label || pendingUrl || frame.url)}
          </EntityChrome.Title>
        </EntityChrome.DragTrigger>
      )}

      {!isEditing && (
        <EntityChrome.Actions>
          <EntityChrome.Button title="Back" disabled={!frame.canGoBack} style={!frame.canGoBack ? { opacity: 0.3 } : undefined} onClick={() => onGoBackFrame(frame.id)}>
            <ChevronLeft size={13} />
          </EntityChrome.Button>
          <EntityChrome.Button title="Forward" disabled={!frame.canGoForward} style={!frame.canGoForward ? { opacity: 0.3 } : undefined} onClick={() => onGoForwardFrame(frame.id)}>
            <ChevronRight size={13} />
          </EntityChrome.Button>
          <EntityChrome.Button title={frame.isLoading ? 'Loading…' : 'Reload'} onClick={() => onReloadFrame(frame.id)}>
            <RotateCw size={11} className={frame.isLoading ? 'animate-spin' : ''} />
          </EntityChrome.Button>
          <EntityChrome.Button title="Frame actions" onClick={() => onShowContextMenu(frame.id)}>
            <EllipsisVertical size={13} />
          </EntityChrome.Button>
        </EntityChrome.Actions>
      )}
    </EntityChrome.Root>
  )
}
