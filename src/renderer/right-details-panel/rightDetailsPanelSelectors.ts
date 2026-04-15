import { VIEWPORT_PRESETS } from '../../shared/constants'
import type {
  Annotation,
  DevtoolsPanelData,
  DevtoolsPanelFrameSummary,
  InspectNodeDetail,
  InspectPanelState,
} from '../../shared/types'
import { isUnresolved } from './rightDetailsPanelHelpers'

type AnnotationGroup = {
  frameKey: string
  frameLabel: string
  frameUrl?: string
  frameWidth?: number
  frameHeight?: number
  unresolved: Annotation[]
  resolved: Annotation[]
}

export function isMcpConnected(
  mcpSetup: DevtoolsPanelData['emptyState'] | null,
): boolean {
  return Boolean(
    mcpSetup?.status.appServerRunning &&
      mcpSetup.status.discoveryFilePresent &&
      mcpSetup.status.mcpClientConnected,
  )
}

export function resolveFrameDimensions(frame: DevtoolsPanelFrameSummary): {
  width?: number
  height?: number
} {
  const preset = VIEWPORT_PRESETS.find((candidate) => candidate.label === frame.label)
  return {
    width: frame.width ?? preset?.width,
    height: frame.height ?? preset?.height,
  }
}

export function groupAnnotationsByFrame(
  annotations: Annotation[],
  frames: DevtoolsPanelFrameSummary[],
): AnnotationGroup[] {
  const frameLookup = new Map(frames.map((frame) => [frame.id, frame]))
  const grouped = new Map<string, AnnotationGroup>()

  const ensureGroup = (frameKey: string): AnnotationGroup => {
    const existing = grouped.get(frameKey)
    if (existing) return existing

    const knownFrame = frameLookup.get(frameKey)
    const dimensions = knownFrame ? resolveFrameDimensions(knownFrame) : {}
    const nextGroup: AnnotationGroup = {
      frameKey,
      frameLabel: frameKey === '__canvas__' ? 'Canvas' : knownFrame?.label ?? frameKey,
      frameUrl: knownFrame?.url,
      frameWidth: dimensions.width,
      frameHeight: dimensions.height,
      unresolved: [],
      resolved: [],
    }
    grouped.set(frameKey, nextGroup)
    return nextGroup
  }

  for (const annotation of annotations) {
    const regionFrames = annotation.anchor.type === 'region'
      ? annotation.metadata?.regionComponents ?? []
      : []

    if (regionFrames.length > 0) {
      // Show region annotations once under the first associated frame
      const group = ensureGroup(regionFrames[0].frameId)
      if (isUnresolved(annotation.status)) group.unresolved.push(annotation)
      else group.resolved.push(annotation)
    } else {
      const frameKey =
        annotation.anchor.type === 'frame' || annotation.anchor.type === 'element'
          ? annotation.anchor.frameId
          : '__canvas__'
      const group = ensureGroup(frameKey)
      if (isUnresolved(annotation.status)) group.unresolved.push(annotation)
      else group.resolved.push(annotation)
    }
  }

  const groups = Array.from(grouped.values())
  groups.sort((a, b) => a.frameLabel.localeCompare(b.frameLabel))
  for (const group of groups) {
    const sortByCreatedAt = (a: Annotation, b: Annotation) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt)
    group.unresolved.sort(sortByCreatedAt)
    group.resolved.sort(sortByCreatedAt)
  }
  return groups
}

export function buildUnresolvedCountsByNodeId(
  annotations: Annotation[],
  activeFrameId: string | null,
): Map<string, number> {
  const unresolvedCountsByNodeId = new Map<string, number>()

  for (const annotation of annotations) {
    if (!isUnresolved(annotation.status)) continue
    if (annotation.anchor.type !== 'element') continue
    if (activeFrameId && annotation.anchor.frameId !== activeFrameId) continue
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
