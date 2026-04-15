import { VIEWPORT_PRESETS } from '../../shared/constants'
import type { Annotation, WorkspacePageSnapshot, WorkspaceSnapshot } from '../../shared/types'

const FALLBACK_PRESET_INDEX = 3
const LEGACY_PRESET_INDEX_MAP: Record<number, number> = {
  0: 0,
  1: 1,
  2: 1,
  3: 2,
  4: 2,
  5: 2,
  6: 3,
  7: 3,
  8: 4,
  9: 3,
  10: 4,
  11: 6,
}

type FrameLabelTarget = Pick<WorkspacePageSnapshot, 'presetIndex' | 'name' | 'title' | 'url'>

function hostnameLabel(url: string | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

export function normalizePresetIndex(presetIndex: number): number {
  if (Number.isInteger(presetIndex) && presetIndex >= 0 && presetIndex < VIEWPORT_PRESETS.length) {
    return presetIndex
  }
  if (Number.isInteger(presetIndex) && presetIndex in LEGACY_PRESET_INDEX_MAP) {
    return LEGACY_PRESET_INDEX_MAP[presetIndex] ?? FALLBACK_PRESET_INDEX
  }
  return Math.min(FALLBACK_PRESET_INDEX, VIEWPORT_PRESETS.length - 1)
}

export function viewportPresetForIndex(presetIndex: number) {
  return VIEWPORT_PRESETS[normalizePresetIndex(presetIndex)]
}

export function frameDisplayLabel(frame: FrameLabelTarget): string {
  const trimmedTitle = frame.title?.trim()
  if (trimmedTitle) return trimmedTitle
  const trimmedName = frame.name?.trim()
  if (trimmedName) return trimmedName
  const hostLabel = hostnameLabel(frame.url)
  if (hostLabel) return hostLabel
  return viewportPresetForIndex(frame.presetIndex)?.label ?? 'Frame'
}

export function cloneAnnotationsForPersistence(
  annotations: Annotation[],
): Annotation[] {
  return JSON.parse(JSON.stringify(annotations)) as Annotation[]
}

export function cloneWorkspaceSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as WorkspaceSnapshot
}
