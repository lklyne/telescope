import type { WebContentsView } from 'electron'
import type {
  ComponentTreeNode,
  InspectNodeDetail,
  WorkspaceFrameSource,
} from '../../shared/types'
import type { DeviceOrientation } from '../../shared/device-catalog'

export interface Page {
  id: string
  name?: string
  title?: string
  url: string
  faviconUrl?: string | null
  frameView: WebContentsView
  pageView: WebContentsView
  chromeView: WebContentsView
  devtoolsHostView?: WebContentsView
  devtoolsHostAttached?: boolean
  presetIndex: number
  canvasX: number
  canvasY: number
  chromeHeight: number
  linked: boolean
  source: WorkspaceFrameSource
  parentGroupId?: string
  groupId?: string
  metadata?: Record<string, unknown>
  componentTree?: ComponentTreeNode[]
  inspectDetailsByNodeId?: Record<string, InspectNodeDetail>
  syncState: {
    suppressNavigationBroadcastUntil: number
    suppressNextScrollBroadcastUntil: number
  }
  peekWidth?: number
  peekHeight?: number
  lastFrameBoundsKey?: string
  lastPageBoundsKey?: string
  lastChromeBoundsKey?: string
  lastPageEmulationKey?: string
  lastPageAnnotationsKey?: string
  lastChromeEmulationKey?: string
  lastChromeUpdateKey?: string
  lastSelected?: boolean
  lastSafeAreaCssKey?: string
  lastSafeAreaCssId?: string
  crashedAt?: number
  crashReason?: string
}

// ---------------------------------------------------------------------------
// Custom size metadata (canvas sizing — renamed from "responsive")
// ---------------------------------------------------------------------------

type FrameCustomSizeMetadata = {
  frameSizeMode?: 'custom' | 'responsive' // accept legacy 'responsive' on read
  customSize?: { width?: unknown; height?: unknown }
  responsiveSize?: { width?: unknown; height?: unknown } // legacy field
}

export function frameOverridesFromMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  const candidate = metadata.overrides
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return undefined
  }
  return candidate as Record<string, unknown>
}

export function frameCustomSizeFromMetadata(
  metadata: Record<string, unknown> | undefined,
): { width: number; height: number } | null {
  if (!metadata) return null
  const candidate = metadata as FrameCustomSizeMetadata
  // Accept both new 'custom' and legacy 'responsive'
  if (candidate.frameSizeMode !== 'custom' && candidate.frameSizeMode !== 'responsive') return null
  // Try new field first, fall back to legacy
  const sizeObj = candidate.customSize ?? candidate.responsiveSize
  const width = sizeObj?.width
  const height = sizeObj?.height
  if (typeof width !== 'number' || typeof height !== 'number') return null
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  return { width, height }
}

export function frameUsesCustomSize(
  metadata: Record<string, unknown> | undefined,
): boolean {
  return frameCustomSizeFromMetadata(metadata) !== null
}

export function setCustomFrameSizeMetadata(
  metadata: Record<string, unknown> | undefined,
  size: { width: number; height: number },
): Record<string, unknown> {
  const next = { ...(metadata ?? {}) }
  next.frameSizeMode = 'custom'
  next.customSize = { width: size.width, height: size.height }
  // Clean up legacy fields
  delete next.responsiveSize
  return next
}

export function clearCustomFrameSizeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  const next = { ...metadata }
  delete next.frameSizeMode
  delete next.customSize
  delete next.responsiveSize
  return Object.keys(next).length ? next : undefined
}

// ---------------------------------------------------------------------------
// Browser size mode metadata (per-frame fill vs device in browser mode)
// ---------------------------------------------------------------------------

export type BrowserSizeMode = 'fill' | 'device'

export function frameBrowserSizeModeFromMetadata(
  metadata: Record<string, unknown> | undefined,
): BrowserSizeMode {
  if (!metadata) return 'device'
  const mode = metadata.browserSizeMode
  return mode === 'fill' ? 'fill' : 'device'
}

export function setFrameBrowserSizeMode(
  metadata: Record<string, unknown> | undefined,
  mode: BrowserSizeMode,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    browserSizeMode: mode,
  }
}

// ---------------------------------------------------------------------------
// Device frame metadata (device shell presentation)
// ---------------------------------------------------------------------------

export function deviceIdFromMetadata(
  metadata: Record<string, unknown> | undefined,
): string | null {
  if (!metadata) return null
  const id = metadata.deviceId
  return typeof id === 'string' ? id : null
}

export function setDeviceIdMetadata(
  metadata: Record<string, unknown> | undefined,
  deviceId: string | null,
): Record<string, unknown> {
  const next = { ...(metadata ?? {}) }
  if (deviceId === null) {
    delete next.deviceId
  } else {
    next.deviceId = deviceId
  }
  return next
}

export function deviceOrientationFromMetadata(
  metadata: Record<string, unknown> | undefined,
): DeviceOrientation {
  if (!metadata) return 'portrait'
  const o = metadata.deviceOrientation
  return o === 'landscape' ? 'landscape' : 'portrait'
}

export function setDeviceOrientationMetadata(
  metadata: Record<string, unknown> | undefined,
  orientation: DeviceOrientation,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    deviceOrientation: orientation,
  }
}

export function showDeviceFrameFromMetadata(
  metadata: Record<string, unknown> | undefined,
): boolean {
  if (!metadata) return false
  return metadata.showDeviceFrame === true
}

export function setShowDeviceFrameMetadata(
  metadata: Record<string, unknown> | undefined,
  show: boolean,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    showDeviceFrame: show,
  }
}

// ---------------------------------------------------------------------------
// SVG device shell rendering mode (A/B toggle)
// ---------------------------------------------------------------------------

export function useSvgDeviceShellFromMetadata(
  metadata: Record<string, unknown> | undefined,
): boolean {
  if (!metadata) return false
  return metadata.useSvgDeviceShell === true
}

export function setUseSvgDeviceShellMetadata(
  metadata: Record<string, unknown> | undefined,
  use: boolean,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    useSvgDeviceShell: use,
  }
}

