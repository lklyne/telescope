import { VIEWPORT_PRESETS } from '../../shared/constants'
import type {
  Annotation,
  DevtoolsPanelPageSummary,
  InspectNodeDetail,
  InspectPanelState,
} from '../../shared/types'
import { annotationOrigin } from '../../shared/annotation-utils'
import { isUnresolved } from './rightDetailsPanelHelpers'

type AnnotationGroup = {
  pageKey: string
  pageLabel: string
  pageUrl?: string
  pageWidth?: number
  pageHeight?: number
  unresolved: Annotation[]
  resolved: Annotation[]
}

export function resolvePageDimensions(page: DevtoolsPanelPageSummary): {
  width?: number
  height?: number
} {
  const preset = VIEWPORT_PRESETS.find((candidate) => candidate.label === page.label)
  return {
    width: page.width ?? preset?.width,
    height: page.height ?? preset?.height,
  }
}

export function groupAnnotationsByPage(
  annotations: Annotation[],
  pages: DevtoolsPanelPageSummary[],
): AnnotationGroup[] {
  const pageLookup = new Map(pages.map((page) => [page.id, page]))
  const grouped = new Map<string, AnnotationGroup>()

  const ensureGroup = (pageKey: string): AnnotationGroup => {
    const existing = grouped.get(pageKey)
    if (existing) return existing

    const knownPage = pageLookup.get(pageKey)
    const dimensions = knownPage ? resolvePageDimensions(knownPage) : {}
    const nextGroup: AnnotationGroup = {
      pageKey,
      pageLabel: pageKey === '__canvas__' ? 'Canvas' : knownPage?.label ?? pageKey,
      pageUrl: knownPage?.url,
      pageWidth: dimensions.width,
      pageHeight: dimensions.height,
      unresolved: [],
      resolved: [],
    }
    grouped.set(pageKey, nextGroup)
    return nextGroup
  }

  for (const annotation of annotations) {
    const regionPages = annotation.anchor.type === 'region'
      ? annotation.metadata?.regionComponents ?? []
      : []

    if (regionPages.length > 0) {
      // Show region annotations once under the first associated page
      const group = ensureGroup(regionPages[0].pageId)
      if (isUnresolved(annotation.status)) group.unresolved.push(annotation)
      else group.resolved.push(annotation)
    } else {
      const pageKey =
        annotation.anchor.type === 'page' || annotation.anchor.type === 'element'
          ? annotation.anchor.pageId
          : '__canvas__'
      const group = ensureGroup(pageKey)
      if (isUnresolved(annotation.status)) group.unresolved.push(annotation)
      else group.resolved.push(annotation)
    }
  }

  const groups = Array.from(grouped.values())
  groups.sort((a, b) => a.pageLabel.localeCompare(b.pageLabel))
  for (const group of groups) {
    const sortByCreatedAt = (a: Annotation, b: Annotation) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt)
    group.unresolved.sort(sortByCreatedAt)
    group.resolved.sort(sortByCreatedAt)
  }
  return groups
}

type OriginGroup = {
  origin: string
  unresolvedCount: number
  annotations: Annotation[]
}

export function groupAnnotationsByOrigin(
  annotations: Annotation[],
): OriginGroup[] {
  const grouped = new Map<string, OriginGroup>()
  for (const annotation of annotations) {
    const origin = annotationOrigin(annotation)
    if (!origin) continue
    const existing = grouped.get(origin) ?? { origin, unresolvedCount: 0, annotations: [] }
    existing.annotations.push(annotation)
    if (isUnresolved(annotation.status)) existing.unresolvedCount++
    grouped.set(origin, existing)
  }
  return Array.from(grouped.values()).sort((a, b) => a.origin.localeCompare(b.origin))
}

export function buildUnresolvedCountsByNodeId(
  annotations: Annotation[],
  activePageId: string | null,
): Map<string, number> {
  const unresolvedCountsByNodeId = new Map<string, number>()

  for (const annotation of annotations) {
    if (!isUnresolved(annotation.status)) continue
    if (annotation.anchor.type !== 'element') continue
    if (activePageId && annotation.anchor.pageId !== activePageId) continue
    const nodeId = annotation.metadata?.inspectContext?.nodeId
    if (!nodeId) continue
    const messageCount = 1 + annotation.replies.length
    unresolvedCountsByNodeId.set(nodeId, (unresolvedCountsByNodeId.get(nodeId) ?? 0) + messageCount)
  }

  return unresolvedCountsByNodeId
}

export function getInspectDetailState(inspect: InspectPanelState): {
  selectedDetail?: InspectNodeDetail
  hoveredDetail?: InspectNodeDetail
  activeDetail?: InspectNodeDetail
} {
  const selectedDetail = inspect.selectedNodeId
    ? inspect.detailById[inspect.selectedNodeId]
    : undefined
  const hoveredDetail = inspect.hoveredNodeId
    ? inspect.detailById[inspect.hoveredNodeId]
    : undefined
  const activeNodeId = inspect.selectedNodeId ?? inspect.hoveredNodeId
  const activeDetail = activeNodeId ? inspect.detailById[activeNodeId] : undefined
  return { selectedDetail, hoveredDetail, activeDetail }
}
