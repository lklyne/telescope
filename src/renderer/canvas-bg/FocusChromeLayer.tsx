import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, EllipsisVertical, Maximize2, Minimize2, RotateCw, Search } from 'lucide-react'
import type {
  CanvasSceneEntity,
  CanvasSceneFileEntity,
  CanvasSceneFrameEntity,
  LayoutUpdateData,
} from '../../shared/types'
import { normalizeUserUrl } from '../../shared/url'
import { EntityChrome } from './EntityChromeHeader'
import { InlineEditLabel } from '../shared/InlineEditLabel'

// Matches src/main/runtime/runtime-constants.ts. Kept here (renderer-side) so
// the chrome doesn't need to depend on main-process constants.
const FOCUS_CHROME_TOP_OFFSET = 8
const FOCUS_CHROME_HEIGHT = 44

interface FocusChromeCallbacks {
  onClearFocus: () => void
  onNavigateFrame: (frameId: string, url: string) => void
  onGoBackFrame: (frameId: string) => void
  onGoForwardFrame: (frameId: string) => void
  onReloadFrame: (frameId: string) => void
  onShowFrameContextMenu: (frameId: string) => void
  onToggleFrameSizeMode: (frameId: string, currentMode: 'fill' | 'fit' | 'device') => void
  onRenameFileEntity: (entityId: string, newName: string) => void
}

export function FocusChromeLayer({
  layoutData,
  isDark,
  callbacks,
}: {
  layoutData: LayoutUpdateData
  isDark: boolean
  callbacks: FocusChromeCallbacks
}) {
  const focusedId = layoutData.focusedEntityId
  if (!focusedId) return null

  const entity = layoutData.entities.find((e): e is CanvasSceneEntity => e.id === focusedId)
  if (!entity) return null

  const leftX = layoutData.canvasOrigin.x + FOCUS_CHROME_TOP_OFFSET
  const topY = layoutData.canvasOrigin.y + FOCUS_CHROME_TOP_OFFSET
  // Width matches the focused entity's visible width (for fill frames this is the full viewport width;
  // for fit frames it matches the zoomed frame). Clamp to a sane minimum and respect the left inset.
  const rawWidth = Math.max(280, entity.screenWidth - FOCUS_CHROME_TOP_OFFSET * 2)
  const width = Math.min(
    rawWidth,
    Math.max(280, layoutData.focusFillViewport.width - FOCUS_CHROME_TOP_OFFSET * 2),
  )
  const pinnedLeftX = Math.max(
    layoutData.canvasOrigin.x + FOCUS_CHROME_TOP_OFFSET,
    entity.screenX + (entity.screenWidth - width) / 2,
  )

  if (entity.kind === 'frame') {
    return (
      <FocusFrameChrome
        frame={entity}
        leftX={pinnedLeftX}
        topY={topY}
        width={width}
        isDark={isDark}
        onClearFocus={callbacks.onClearFocus}
        onNavigateFrame={callbacks.onNavigateFrame}
        onGoBackFrame={callbacks.onGoBackFrame}
        onGoForwardFrame={callbacks.onGoForwardFrame}
        onReloadFrame={callbacks.onReloadFrame}
        onShowContextMenu={callbacks.onShowFrameContextMenu}
        onToggleSizeMode={callbacks.onToggleFrameSizeMode}
      />
    )
  }

  if (entity.kind === 'file') {
    return (
      <FocusFileChrome
        entity={entity}
        leftX={pinnedLeftX}
        topY={topY}
        width={width}
        isDark={isDark}
        onClearFocus={callbacks.onClearFocus}
        onRenameFileEntity={callbacks.onRenameFileEntity}
      />
    )
  }

  // Generic fallback: a minimal bar with the entity label + exit button
  const label = 'label' in entity ? (entity as { label?: string }).label ?? 'Focused' : 'Focused'
  return (
    <EntityChrome.Root
      positioning={{ mode: 'pinned', leftX: pinnedLeftX, topY, width, height: FOCUS_CHROME_HEIGHT }}
      isDark={isDark}
      isActive
    >
      <EntityChrome.Title>{label}</EntityChrome.Title>
      <EntityChrome.Actions>
        <EntityChrome.Button title="Exit focus (Esc)" onClick={callbacks.onClearFocus}>
          <Minimize2 size={13} />
        </EntityChrome.Button>
      </EntityChrome.Actions>
    </EntityChrome.Root>
  )
}

function FocusFrameChrome({
  frame,
  leftX,
  topY,
  width,
  isDark,
  onClearFocus,
  onNavigateFrame,
  onGoBackFrame,
  onGoForwardFrame,
  onReloadFrame,
  onShowContextMenu,
  onToggleSizeMode,
}: {
  frame: CanvasSceneFrameEntity
  leftX: number
  topY: number
  width: number
  isDark: boolean
  onClearFocus: () => void
  onNavigateFrame: (frameId: string, url: string) => void
  onGoBackFrame: (frameId: string) => void
  onGoForwardFrame: (frameId: string) => void
  onReloadFrame: (frameId: string) => void
  onShowContextMenu: (frameId: string) => void
  onToggleSizeMode: (frameId: string, currentMode: 'fill' | 'fit' | 'device') => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)
  const isBlank = frame.url === 'about:blank' && !pendingUrl

  useEffect(() => { setPendingUrl(null) }, [frame.url])

  const editValue = isBlank ? '' : frame.url
  const displayValue = isBlank ? 'Type a URL' : frame.label || pendingUrl || frame.url

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
      positioning={{ mode: 'pinned', leftX, topY, width, height: FOCUS_CHROME_HEIGHT }}
      isDark={isDark}
      isActive
    >
      <EntityChrome.Button title="Back" disabled={!frame.canGoBack} style={!frame.canGoBack ? { opacity: 0.3 } : undefined} onClick={() => onGoBackFrame(frame.id)}>
        <ChevronLeft size={14} />
      </EntityChrome.Button>
      <EntityChrome.Button title="Forward" disabled={!frame.canGoForward} style={!frame.canGoForward ? { opacity: 0.3 } : undefined} onClick={() => onGoForwardFrame(frame.id)}>
        <ChevronRight size={14} />
      </EntityChrome.Button>
      <EntityChrome.Button title={frame.isLoading ? 'Loading…' : 'Reload'} onClick={() => onReloadFrame(frame.id)}>
        <RotateCw size={12} className={frame.isLoading ? 'animate-spin' : ''} />
      </EntityChrome.Button>
      <div className="mx-1 min-w-0 flex-1">
        <div
          className={`flex h-7 min-w-0 items-center gap-1.5 rounded-[7px] px-2 text-xs ${
            isDark ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-100 text-zinc-700'
          }`}
        >
          {faviconIcon}
          <InlineEditLabel
            value={editValue}
            displayValue={displayValue}
            isEditing={isEditing}
            onStartEdit={() => setIsEditing(true)}
            onCommit={handleCommitUrl}
            onCancel={() => setIsEditing(false)}
            variant="canvas-chrome"
            isDark={isDark}
            placeholder={isBlank ? 'Type a URL' : frame.url}
            titleClassName={`min-w-0 truncate ${isBlank ? 'text-zinc-400' : ''}`}
            onTitleClick={() => setIsEditing(true)}
          />
        </div>
      </div>
      <EntityChrome.Button
        title={frame.sizeMode === 'fill' ? 'Switch to fit' : 'Switch to fill'}
        onClick={() => onToggleSizeMode(frame.id, frame.sizeMode)}
      >
        <Maximize2 size={12} />
      </EntityChrome.Button>
      <EntityChrome.Button title="Frame actions" onClick={() => onShowContextMenu(frame.id)}>
        <EllipsisVertical size={14} />
      </EntityChrome.Button>
      <EntityChrome.Button title="Exit focus (Esc)" onClick={onClearFocus}>
        <Minimize2 size={13} />
      </EntityChrome.Button>
    </EntityChrome.Root>
  )
}

function FocusFileChrome({
  entity,
  leftX,
  topY,
  width,
  isDark,
  onClearFocus,
  onRenameFileEntity,
}: {
  entity: CanvasSceneFileEntity
  leftX: number
  topY: number
  width: number
  isDark: boolean
  onClearFocus: () => void
  onRenameFileEntity: (entityId: string, newName: string) => void
}) {
  const [isRenaming, setIsRenaming] = useState(false)
  const fileName = entity.file.split('/').pop() ?? entity.file
  const displayName = fileName
    .replace(/\.wireframe\.json$/i, '')
    .replace(/\.md$/i, '')

  return (
    <EntityChrome.Root
      positioning={{ mode: 'pinned', leftX, topY, width, height: FOCUS_CHROME_HEIGHT }}
      isDark={isDark}
      isActive
    >
      <div className="min-w-0 flex-1 pl-1">
        <InlineEditLabel
          value={displayName}
          displayValue={displayName}
          isEditing={isRenaming}
          onStartEdit={() => setIsRenaming(true)}
          onCommit={(next) => {
            const trimmed = next.trim()
            if (trimmed && trimmed !== displayName) onRenameFileEntity(entity.id, trimmed)
            setIsRenaming(false)
          }}
          onCancel={() => setIsRenaming(false)}
          variant="canvas-chrome"
          isDark={isDark}
          titleClassName="min-w-0 truncate font-medium"
          onTitleClick={() => setIsRenaming(true)}
        />
      </div>
      <EntityChrome.Button title="Exit focus (Esc)" onClick={onClearFocus}>
        <Minimize2 size={13} />
      </EntityChrome.Button>
    </EntityChrome.Root>
  )
}
