import type {
  CreateFramesRequest,
  CreateFramesResponse,
  PageConfig,
  WorkspaceGroup,
} from '../shared/types'
import {
  CLUSTER_HORIZONTAL_GUTTER,
  CLUSTER_OUTER_MARGIN,
  USER_GROUP_PADDING,
  VIEWPORT_PRESETS,
} from '../shared/constants'
import { defaultOrientationForDevice, deviceForPresetIndex } from '../shared/device-catalog'
import {
  createPage,
  findPageById,
  pages,
} from './runtime/page-runtime'
import {
  getSelectedEntityIds,
  selectPageById,
  setSelectedEntities,
  setSelectedFrames,
  setSelectedGroupId,
} from './runtime/ui-actions'
import { textEntities, createTextEntity as createTextEntityInState } from './runtime/text-entity-state'
import { fileEntities, createFileEntity as createFileEntityInState } from './runtime/file-entity-state'
import { shapeEntities, createShapeEntity as createShapeEntityInState } from './runtime/shape-entity-state'
import {
  layoutAllViews,
  pageContentSize,
  snapToGrid,
} from './runtime/surface-layout'
import { scheduleWorkspaceAutosave } from './runtime/workspace-session'
import { setCustomFrameSizeMetadata, setDeviceIdMetadata } from './runtime/runtime-entities'
import { makeId, cloneMetadata, pageCurrentUrl, createGroup } from './workspace-utils'
import {
  entityBoundsById,
  frameSelectableBounds,
  groupById,
  groupChildIds,
  unionBounds,
} from './workspace-entities'
import { findDuplicatePlacement } from './workspace-placement'

// --- Helpers ---

function globalRightmostPlacement(
  presetIndex: number,
): Pick<PageConfig, 'canvasX' | 'canvasY'> {
  const maxRight = pages.reduce((rightmost, page) => {
    const size = pageContentSize(page)
    return Math.max(rightmost, page.canvasX + size.width + CLUSTER_HORIZONTAL_GUTTER)
  }, CLUSTER_OUTER_MARGIN)

  return {
    canvasX: snapToGrid(Math.max(CLUSTER_OUTER_MARGIN, maxRight)),
    canvasY: snapToGrid(CLUSTER_OUTER_MARGIN),
  }
}

function manualGroupLabel(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return `Frames: ${parsed.hostname}${path}`
  } catch {
    return 'Frames'
  }
}

function ensureManualRowGroup(sourceFrameId: string, url: string): WorkspaceGroup {
  const existingPage = findPageById(sourceFrameId)
  if (existingPage?.parentGroupId) {
    const existingGroup = groupById(existingPage.parentGroupId)
    if (existingGroup) return existingGroup
  }

  const sourceBounds = entityBoundsById(sourceFrameId) ?? { x: 0, y: 0, width: 0, height: 0 }

  const group = createGroup({
    id: makeId('group'),
    kind: 'group',
    label: manualGroupLabel(url),
    canvasX: sourceBounds.x - USER_GROUP_PADDING,
    canvasY: sourceBounds.y - USER_GROUP_PADDING,
    width: sourceBounds.width + USER_GROUP_PADDING * 2,
    height: sourceBounds.height + USER_GROUP_PADDING * 2,
    parentGroupId: existingPage?.parentGroupId,
    layoutMode: 'row',
    managedLayout: true,
    metadata: {
      url,
      createdFrom: 'manual_row',
    },
  })

  if (existingPage) {
    existingPage.parentGroupId = group.id
  }

  return group
}

function orderedPagesForGroup(group: WorkspaceGroup) {
  return pages
    .filter((page) => page.parentGroupId === group.id)
    .sort((a, b) => a.canvasX - b.canvasX)
}

function reflowGroupRow(group: WorkspaceGroup): void {
  const rowPages = orderedPagesForGroup(group)
  if (!rowPages.length) return

  const rowY = snapToGrid(Math.min(...rowPages.map((page) => page.canvasY)))
  let cursorX = snapToGrid(Math.min(...rowPages.map((page) => page.canvasX)))
  for (const page of rowPages) {
    const size = pageContentSize(page)
    page.canvasX = cursorX
    page.canvasY = rowY
    page.parentGroupId = group.id
    cursorX = snapToGrid(cursorX + size.width + CLUSTER_HORIZONTAL_GUTTER)
  }
  const bounds = unionBounds(rowPages.map((page) => frameSelectableBounds(page)))
  if (bounds) {
    group.canvasX = bounds.x - USER_GROUP_PADDING
    group.canvasY = bounds.y - USER_GROUP_PADDING
    group.width = bounds.width + USER_GROUP_PADDING * 2
    group.height = bounds.height + USER_GROUP_PADDING * 2
  }
}

// --- Exported frame operations ---

export function addFrameFromSource(input: {
  sourceFrameId?: string
  presetIndex: number
  customSize?: boolean
  mode: 'add_from_toolbar' | 'duplicate'
  focus?: boolean
}): { frameId: string; groupId?: string } {
  const preset = VIEWPORT_PRESETS[input.presetIndex]
  if (!preset) {
    throw new Error(`Unknown preset index: ${input.presetIndex}`)
  }

  const sourcePage = input.sourceFrameId ? findPageById(input.sourceFrameId) : undefined
  const url = pageCurrentUrl(sourcePage?.id) ?? 'about:blank'

  if (!sourcePage) {
    const placement = globalRightmostPlacement(input.presetIndex)
    const device = deviceForPresetIndex(input.presetIndex)
    const page = createPage({
      url,
      presetIndex: input.presetIndex,
      linked: false,
      canvasX: placement.canvasX,
      canvasY: placement.canvasY,
      source: 'manual',
      metadata: setDeviceIdMetadata({ createdFrom: input.mode, deviceOrientation: defaultOrientationForDevice(device) }, device?.id ?? null),
    })
    if (input.customSize) {
      page.metadata = setCustomFrameSizeMetadata(page.metadata, pageContentSize(page))
    }
    if (input.focus ?? true) {
      selectPageById(page.id)
    }
    layoutAllViews()
    scheduleWorkspaceAutosave()
    return { frameId: page.id }
  }

  const group = sourcePage.parentGroupId
    ? groupById(sourcePage.parentGroupId) ?? ensureManualRowGroup(sourcePage.id, url)
    : ensureManualRowGroup(sourcePage.id, url)

  const fallbackDevice = deviceForPresetIndex(input.presetIndex)
  const duplicateMetadata = input.mode === 'duplicate' && sourcePage
    ? { ...(cloneMetadata(sourcePage.metadata) ?? {}), createdFrom: input.mode }
    : setDeviceIdMetadata({ createdFrom: input.mode, deviceOrientation: defaultOrientationForDevice(fallbackDevice) }, fallbackDevice?.id ?? null)
  const newPage = createPage({
    url,
    presetIndex: input.presetIndex,
    linked: false,
    suppressInitialNavigationBroadcast: true,
    canvasX: sourcePage.canvasX,
    canvasY: sourcePage.canvasY,
    source: 'manual',
    parentGroupId: group.id,
    metadata: duplicateMetadata,
  })
  if (input.customSize) {
    newPage.metadata = setCustomFrameSizeMetadata(newPage.metadata, pageContentSize(newPage))
  }
  newPage.parentGroupId = group.id
  reflowGroupRow(group)

  if (input.focus ?? true) {
    setSelectedGroupId(group.id)
    selectPageById(newPage.id)
  }
  layoutAllViews()
  scheduleWorkspaceAutosave()
  return { frameId: newPage.id, groupId: group.id }
}

export function createFrameAtPosition(input: {
  sourceFrameId?: string
  presetIndex: number
  customSize?: boolean
  canvasX: number
  canvasY: number
  mode: 'add_from_toolbar' | 'duplicate'
  focus?: boolean
}): { frameId: string } {
  const preset = VIEWPORT_PRESETS[input.presetIndex]
  if (!preset) {
    throw new Error(`Unknown preset index: ${input.presetIndex}`)
  }

  const url = pageCurrentUrl(input.sourceFrameId) ?? 'about:blank'
  // Auto-assign device based on the preset so orientation tabs appear immediately
  const matchedDevice = deviceForPresetIndex(input.presetIndex)
  const metadata = setDeviceIdMetadata(
    { createdFrom: input.mode, deviceOrientation: defaultOrientationForDevice(matchedDevice) },
    matchedDevice?.id ?? null,
  )

  const page = createPage({
    url,
    presetIndex: input.presetIndex,
    linked: false,
    canvasX: snapToGrid(input.canvasX),
    canvasY: snapToGrid(input.canvasY),
    source: 'manual',
    metadata,
  })
  if (input.customSize) {
    page.metadata = setCustomFrameSizeMetadata(page.metadata, pageContentSize(page))
  }

  if (input.focus ?? true) {
    selectPageById(page.id)
  }
  layoutAllViews()
  scheduleWorkspaceAutosave()
  return { frameId: page.id }
}

export function duplicateFrameFromSource(input: {
  sourceFrameId: string
  focus?: boolean
  /** When true, skip automatic row-group creation (context menu duplicate). */
  skipGrouping?: boolean
}): { frameId: string; groupId?: string } {
  const sourcePage = findPageById(input.sourceFrameId)
  if (!sourcePage) {
    throw new Error(`Unknown frame: ${input.sourceFrameId}`)
  }

  if (input.skipGrouping) {
    const url = pageCurrentUrl(sourcePage.id) ?? 'about:blank'
    const metadata = { ...(cloneMetadata(sourcePage.metadata) ?? {}), createdFrom: 'duplicate' }
    const sourceSize = pageContentSize(sourcePage)
    const placement = findDuplicatePlacement({
      x: sourcePage.canvasX,
      y: sourcePage.canvasY,
      width: sourceSize.width,
      height: sourceSize.height,
    })
    const newPage = createPage({
      url,
      presetIndex: sourcePage.presetIndex,
      linked: false,
      suppressInitialNavigationBroadcast: true,
      canvasX: placement.canvasX,
      canvasY: placement.canvasY,
      source: 'manual',
      parentGroupId: sourcePage.parentGroupId,
      metadata,
    })
    if (input.focus ?? true) {
      selectPageById(newPage.id)
    }
    layoutAllViews()
    scheduleWorkspaceAutosave()
    return { frameId: newPage.id }
  }

  return addFrameFromSource({
    sourceFrameId: sourcePage.id,
    presetIndex: sourcePage.presetIndex,
    mode: 'duplicate',
    focus: input.focus,
  })
}

export function createFrames(input: CreateFramesRequest): CreateFramesResponse {
  const frameIds: string[] = []
  for (const frame of input.frames) {
    const page = createPage(frame)
    frameIds.push(page.id)
  }
  layoutAllViews()
  if (frameIds.length) scheduleWorkspaceAutosave()
  return { frameIds }
}

export function tidySelectedFrames(): { frameIds: string[] } {
  const selectedFrameIds = getSelectedEntityIds()
  if (!selectedFrameIds.length) return { frameIds: [] }

  const pagesToTidy = selectedFrameIds
    .map((frameId) => findPageById(frameId))
    .filter(
      (
        page,
      ): page is Exclude<ReturnType<typeof findPageById>, undefined> =>
        page !== undefined,
    )

  if (!pagesToTidy.length) return { frameIds: [] }

  pagesToTidy.sort((a, b) => {
    const aSize = pageContentSize(a)
    const bSize = pageContentSize(b)
    const areaDelta = aSize.width * aSize.height - bSize.width * bSize.height
    if (areaDelta !== 0) return areaDelta
    const widthDelta = aSize.width - bSize.width
    if (widthDelta !== 0) return widthDelta
    return a.id.localeCompare(b.id)
  })

  const startX = snapToGrid(Math.min(...pagesToTidy.map((page) => page.canvasX)))
  const endX = snapToGrid(
    Math.max(
      ...pagesToTidy.map((page) => page.canvasX + pageContentSize(page).width),
    ),
  )
  const startY = snapToGrid(Math.min(...pagesToTidy.map((page) => page.canvasY)))
  const totalWidth = pagesToTidy.reduce(
    (sum, page) => sum + pageContentSize(page).width,
    0,
  )
  const gapCount = Math.max(0, pagesToTidy.length - 1)
  const availableGapWidth = Math.max(0, endX - startX - totalWidth)
  const distributedGap = gapCount > 0 ? availableGapWidth / gapCount : 0

  let cursorX = startX
  for (const page of pagesToTidy) {
    const { width } = pageContentSize(page)
    page.canvasX = cursorX
    page.canvasY = startY
    cursorX = page.canvasX + width + distributedGap
  }

  layoutAllViews()
  scheduleWorkspaceAutosave()
  return { frameIds: pagesToTidy.map((page) => page.id) }
}

export function duplicateEntity(input: {
  entityId: string
  focus?: boolean
}): { entityId: string } {
  const page = findPageById(input.entityId)
  if (page) {
    const result = duplicateFrameFromSource({
      sourceFrameId: page.id,
      focus: input.focus,
    })
    return { entityId: result.frameId }
  }

  const note = textEntities.find((n) => n.id === input.entityId)
  if (note) {
    const notePlacement = findDuplicatePlacement({
      x: note.canvasX,
      y: note.canvasY,
      width: note.width,
      height: note.height,
    })
    const newNote = createTextEntityInState({
      canvasX: notePlacement.canvasX,
      canvasY: notePlacement.canvasY,
      text: note.text,
      color: note.color,
      width: note.width,
      height: note.height,
    })
    if (input.focus ?? true) {
      setSelectedEntities([newNote.id])
    }
    layoutAllViews()
    scheduleWorkspaceAutosave()
    return { entityId: newNote.id }
  }

  const file = fileEntities.find((f) => f.id === input.entityId)
  if (file) {
    const filePlacement = findDuplicatePlacement({
      x: file.canvasX,
      y: file.canvasY,
      width: file.width,
      height: file.height,
    })
    const newFile = createFileEntityInState({
      canvasX: filePlacement.canvasX,
      canvasY: filePlacement.canvasY,
      file: file.file,
      subpath: file.subpath,
      width: file.width,
      height: file.height,
      presetIndex: file.presetIndex,
      metadata: file.metadata ? { ...file.metadata } : undefined,
      objectFit: file.objectFit,
    })
    if (input.focus ?? true) {
      setSelectedEntities([newFile.id])
    }
    layoutAllViews()
    scheduleWorkspaceAutosave()
    return { entityId: newFile.id }
  }

  const shape = shapeEntities.find((s) => s.id === input.entityId)
  if (shape) {
    const shapePlacement = findDuplicatePlacement({
      x: shape.canvasX,
      y: shape.canvasY,
      width: shape.width,
      height: shape.height,
    })
    const newShape = createShapeEntityInState({
      canvasX: shapePlacement.canvasX,
      canvasY: shapePlacement.canvasY,
      shapeKind: shape.shapeKind,
      text: shape.text,
      color: shape.color,
      strokeWidth: shape.strokeWidth,
      theme: shape.theme,
      width: shape.width,
      height: shape.height,
      label: shape.label,
    })
    if (input.focus ?? true) {
      setSelectedEntities([newShape.id])
    }
    layoutAllViews()
    scheduleWorkspaceAutosave()
    return { entityId: newShape.id }
  }

  throw new Error(`Unknown entity: ${input.entityId}`)
}
