import type {
  Annotation,
  AnnotationCreateRequest,
  AnnotationMetadata,
  AnnotationStatus,
} from '../shared/types'
import {
  findPageById,
  getComponentAncestryByNodeId,
  getComponentSourceLocationByNodeId,
} from './runtime/page-runtime'
import { markDirty } from './runtime/layout-dirty'
import { requestLayout } from './runtime/surface-layout'
import { workspaceAnnotations } from './runtime/workspace-model'
import { scheduleWorkspaceAutosave } from './runtime/workspace-session'
import { makeId } from './workspace-utils'
import { VIEWPORT_PRESETS } from '../shared/constants'

function canonicalAnnotationUrl(value: string | undefined | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    const parsed = new URL(trimmed)
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return trimmed
  }
}

function resolveFrameName(frameId: string): string | undefined {
  const page = findPageById(frameId)
  if (!page) return undefined
  const preset = VIEWPORT_PRESETS[page.presetIndex]
  if (!preset) return undefined
  const label = page.name?.trim() || preset.label
  return `${label} ${preset.width}×${preset.height}`
}

function resolveFramePageUrl(frameId: string): string | undefined {
  const page = findPageById(frameId)
  if (!page) return undefined
  return canonicalAnnotationUrl(page.pageView.webContents.getURL())
}

function enrichedAnnotationMetadata(
  request: AnnotationCreateRequest,
): AnnotationMetadata | undefined {
  const anchor = request.anchor
  const frameName =
    anchor.type === 'frame' || anchor.type === 'element'
      ? resolveFrameName(anchor.frameId)
      : undefined
  const pageUrl =
    anchor.type === 'frame' || anchor.type === 'element'
      ? resolveFramePageUrl(anchor.frameId)
      : undefined

  const metadata = request.metadata ? { ...request.metadata } : undefined
  const metadataWithContext: AnnotationMetadata = {
    ...(metadata ?? {}),
    ...(frameName ? { frameName } : {}),
    ...(pageUrl ? { pageUrl } : {}),
  }

  // For non-element anchors, just attach frameName if available
  if (anchor.type !== 'element') {
    return Object.keys(metadataWithContext).length ? metadataWithContext : undefined
  }

  const inspectContext = metadataWithContext.inspectContext
  if (!inspectContext?.nodeId) {
    return Object.keys(metadataWithContext).length ? metadataWithContext : undefined
  }

  const reactComponents = getComponentAncestryByNodeId(
    anchor.frameId,
    inspectContext.nodeId,
  )
  const sourceLocation = getComponentSourceLocationByNodeId(
    anchor.frameId,
    inspectContext.nodeId,
  )

  return {
    ...metadataWithContext,
    ...((reactComponents.length || sourceLocation)
      ? {
          inspectContext: {
            ...inspectContext,
            ...(reactComponents.length ? { reactComponents } : {}),
            ...(sourceLocation ? { sourceLocation } : {}),
          },
        }
      : {}),
  }
}

export function getAnnotations(filters?: {
  status?: AnnotationStatus
  url?: string
  frameId?: string
}): Annotation[] {
  const targetUrl = canonicalAnnotationUrl(filters?.url)
  return workspaceAnnotations.filter((annotation) => {
    if (filters?.status && annotation.status !== filters.status) {
      return false
    }
    if (filters?.frameId) {
      if (annotation.anchor.type === 'canvas') return false
      if (annotation.anchor.type === 'region') {
        const match = annotation.metadata?.regionComponents?.some(
          (g) => g.frameId === filters.frameId,
        ) ?? false
        if (!match) return false
      } else if (annotation.anchor.frameId !== filters.frameId) {
        return false
      }
    }
    if (targetUrl) {
      const annotationUrl = canonicalAnnotationUrl(annotation.metadata?.pageUrl)
      if (!annotationUrl || annotationUrl !== targetUrl) return false
    }
    return true
  })
}

export function getAnnotationById(id: string): Annotation | undefined {
  return workspaceAnnotations.find((a) => a.id === id)
}

export function createAnnotation(request: AnnotationCreateRequest): Annotation {
  const annotation: Annotation = {
    id: makeId('ann'),
    anchor: request.anchor,
    author: request.author ?? 'user',
    text: request.text,
    kind: request.kind ?? 'comment',
    status: 'pending',
    replies: [],
    createdAt: new Date().toISOString(),
    metadata: enrichedAnnotationMetadata(request),
  }
  workspaceAnnotations.push(annotation)
  markDirty('canvas', 'pages')
  requestLayout()
  scheduleWorkspaceAutosave()
  return annotation
}

export function updateAnnotationStatus(
  id: string,
  status: AnnotationStatus,
  reason?: string,
): Annotation | null {
  const annotation = workspaceAnnotations.find((a) => a.id === id)
  if (!annotation) return null
  annotation.status = status
  if (reason) {
    annotation.metadata = { ...annotation.metadata, dismissReason: reason }
  }
  markDirty('canvas', 'pages')
  requestLayout()
  scheduleWorkspaceAutosave()
  return annotation
}

export function addAnnotationReply(
  id: string,
  author: 'user' | 'agent',
  text: string,
): Annotation | null {
  const annotation = workspaceAnnotations.find((a) => a.id === id)
  if (!annotation) return null
  annotation.replies.push({
    author,
    text,
    timestamp: new Date().toISOString(),
  })
  markDirty('canvas', 'pages')
  requestLayout()
  scheduleWorkspaceAutosave()
  return annotation
}

export function moveAnnotation(
  id: string,
  dx: number,
  dy: number,
): Annotation | null {
  const annotation = workspaceAnnotations.find((candidate) => candidate.id === id)
  if (!annotation) return null
  if (annotation.anchor.type !== 'canvas') return null

  annotation.anchor = {
    ...annotation.anchor,
    canvasX: annotation.anchor.canvasX + dx,
    canvasY: annotation.anchor.canvasY + dy,
  }

  markDirty('canvas', 'pages')
  requestLayout()
  scheduleWorkspaceAutosave()
  return annotation
}

export function deleteAnnotation(id: string): boolean {
  const idx = workspaceAnnotations.findIndex((a) => a.id === id)
  if (idx === -1) return false
  workspaceAnnotations.splice(idx, 1)
  markDirty('canvas', 'pages')
  requestLayout()
  scheduleWorkspaceAutosave()
  return true
}
