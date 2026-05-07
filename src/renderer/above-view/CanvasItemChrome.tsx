/**
 * CanvasItemChrome — compound component for always-on chrome anchored to a
 * canvas entity. Per ADR 0002 §2 this lives in aboveView's React tree; the
 * router yields to it via the `data-overlay-ui` tag set on `EntityChrome.Root`.
 *
 * Shape mirrors `EntityChrome` (`Root / DragTrigger / Title / Actions / Button`)
 * — Root takes `entityId` + the layout broadcast and uses `useAnchoredPosition`
 * to position itself; the rest are direct re-exports of the shared primitives
 * so consumers compose the same way regardless of which surface they live in.
 */

import { type ReactNode } from 'react'
import { EntityChrome } from '../shared/EntityChrome'
import { useAnchoredPosition } from './useAnchoredPosition'
import type { LayoutUpdateData } from '../../shared/types'

function Root({
  entityId,
  layout,
  isDark,
  isActive,
  dragEnabled = true,
  onPointerDown,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  entityId: string
  layout: LayoutUpdateData
  isDark: boolean
  isActive: boolean
  dragEnabled?: boolean
  onPointerDown?: (e: React.PointerEvent) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  children: ReactNode
}) {
  const headerRect = useAnchoredPosition(layout, entityId, 'header')
  if (!headerRect) return null
  // EntityChrome.Root applies `transform: translateY(-100%)` and uses the
  // body's screen position; we feed it the header rect's *bottom edge* as
  // pseudo-screenY so its translate lands the chrome at the slot we want.
  return (
    <EntityChrome.Root
      screenX={headerRect.x}
      screenY={headerRect.y + headerRect.height}
      screenWidth={headerRect.width}
      isDark={isDark}
      isActive={isActive}
      dragEnabled={dragEnabled}
      onPointerDown={onPointerDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </EntityChrome.Root>
  )
}

export const CanvasItemChrome = {
  Root,
  DragTrigger: EntityChrome.DragTrigger,
  Title: EntityChrome.Title,
  Actions: EntityChrome.Actions,
  Button: EntityChrome.Button,
}
