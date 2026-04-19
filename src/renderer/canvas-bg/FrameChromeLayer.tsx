import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, EllipsisVertical, Maximize2, RotateCw, Search } from 'lucide-react'
import type { CanvasSceneFrameEntity } from '../../shared/types'
import { normalizeUserUrl } from '../../shared/url'
import { EntityChrome } from './EntityChromeHeader'
import { InlineEditLabel } from '../shared/InlineEditLabel'

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
  onSetFocus,
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
  onSetFocus: (frameId: string) => void
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
            onSetFocus={onSetFocus}
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
  onSetFocus,
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
  onSetFocus: (frameId: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)

  const isBlank = frame.url === 'about:blank' && !pendingUrl

  useEffect(() => {
    setPendingUrl(null)
  }, [frame.url])

  // Reset editing when becoming inactive
  useEffect(() => {
    if (!isActive && isEditing) setIsEditing(false)
  }, [isActive, isEditing])

  const editValue = isBlank ? '' : frame.url
  const displayValue = isBlank
    ? 'Type a URL'
    : frame.label || pendingUrl || frame.url

  const handleCommitUrl = (next: string) => {
    const trimmed = next.trim()
    if (trimmed && trimmed !== frame.url) {
      const normalized = normalizeUserUrl(trimmed)
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
      <EntityChrome.DragTrigger
        onMouseDown={isEditing ? (event) => event.stopPropagation() : undefined}
      >
        {faviconIcon}
        <InlineEditLabel
          value={editValue}
          displayValue={displayValue}
          isEditing={isEditing}
          onStartEdit={isSelected ? () => setIsEditing(true) : undefined}
          onCommit={handleCommitUrl}
          onCancel={() => setIsEditing(false)}
          variant="canvas-chrome"
          isDark={isDark}
          placeholder={isBlank ? 'Type a URL' : frame.url}
          titleClassName={`min-w-0 truncate font-medium ${isBlank ? 'text-zinc-400' : ''}`}
          onTitleClick={isSelected ? () => setIsEditing(true) : undefined}
        />
      </EntityChrome.DragTrigger>

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
          <EntityChrome.Button title="Focus this frame" onClick={() => onSetFocus(frame.id)}>
            <Maximize2 size={11} />
          </EntityChrome.Button>
          <EntityChrome.Button title="Frame actions" onClick={() => onShowContextMenu(frame.id)}>
            <EllipsisVertical size={13} />
          </EntityChrome.Button>
        </EntityChrome.Actions>
      )}
    </EntityChrome.Root>
  )
}
