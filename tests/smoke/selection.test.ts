import { afterEach, describe, expect, it } from 'vitest'
import {
  createFocusedFrame,
  createFrames,
  createGroup,
  deleteFrames,
  deselectSelection,
  enterGroup,
  getSelection,
  getSelectionOverlayState,
  selectGroup,
  selectPage,
  ungroup,
} from './app-client'
import { waitFor } from './test-utils'

const createdFrameIds: string[] = []

async function createFrame(input: { url: string; canvasX: number; canvasY: number; presetIndex?: number }) {
  const result = await createFrames([input])
  createdFrameIds.push(...result.frameIds)
  return result.frameIds[0]
}

async function createFramePair(aY: number) {
  const firstId = await createFrame({
    url: 'https://example.com',
    canvasX: 120,
    canvasY: aY,
  })
  const secondId = await createFrame({
    url: 'https://example.org',
    canvasX: 620,
    canvasY: aY,
  })
  return [firstId, secondId]
}

async function cleanupFrames() {
  if (!createdFrameIds.length) return
  const frameIds = createdFrameIds.splice(0, createdFrameIds.length)
  await deleteFrames(frameIds)
}

describe('selection', () => {
  afterEach(async () => {
    await cleanupFrames()
  })

  it('selecting a group clears stale child-frame interactivity and deselect works', async () => {
    const frameIds = await createFramePair(120)

    await selectPage(frameIds[0])
    const group = await createGroup(frameIds, 'Smoke group')
    await selectGroup(group.id)

    const selection = await waitFor(
      () => getSelection(),
      (value) => value.selectedGroupId === group.id,
      'Timed out waiting for group selection',
    )
    expect(selection.selectedEntityIds ?? []).toEqual([])
    expect(selection.selectedGroupId).toBe(group.id)

    const overlay = await waitFor(
      () => getSelectionOverlayState(),
      (value) => {
        const states = value.pages.filter((page) => frameIds.includes(page.frameId))
        return states.length === 2 && states.every((page) => !page.interactive && page.multiSelected)
      },
      'Timed out waiting for group overlay state (non-interactive, multiSelected)',
    )
    const groupStates = overlay.pages.filter((page) => frameIds.includes(page.frameId))
    expect(groupStates).toHaveLength(2)
    expect(groupStates.every((page) => page.interactive === false)).toBe(true)
    expect(groupStates.every((page) => page.multiSelected === true)).toBe(true)

    await deselectSelection()

    const cleared = await getSelection()
    expect(cleared.selectedEntityIds ?? []).toEqual([])
    expect(cleared.selectedGroupId).toBeUndefined()

    const clearedOverlay = await getSelectionOverlayState()
    const clearedGroupStates = clearedOverlay.pages.filter((page) => frameIds.includes(page.frameId))
    expect(clearedGroupStates).toHaveLength(2)
    expect(clearedGroupStates.every((page) => !page.interactive && !page.multiSelected)).toBe(true)
  })

  it('ungrouping selects freed entities and preserves non-interactive overlay state until deselect', async () => {
    const frameIds = await createFramePair(260)

    const group = await createGroup(frameIds, 'Ungroup me')
    await selectGroup(group.id)
    const ungrouped = await ungroup(group.id)

    expect(ungrouped.entityIds.sort()).toEqual([...frameIds].sort())

    const selection = await waitFor(
      () => getSelection(),
      (value) => (value.selectedEntityIds ?? []).sort().join(',') === [...frameIds].sort().join(','),
      'Timed out waiting for ungrouped frames to become selected',
    )
    expect((selection.selectedEntityIds ?? []).sort()).toEqual([...frameIds].sort())
    expect(selection.selectedGroupId).toBeUndefined()

    const overlay = await getSelectionOverlayState()
    const selectedStates = overlay.pages.filter((page) => frameIds.includes(page.frameId))
    expect(selectedStates.every((page) => page.interactive === false)).toBe(true)
    expect(selectedStates.every((page) => page.multiSelected === true)).toBe(true)

    await deselectSelection()

    const cleared = await getSelection()
    expect(cleared.selectedEntityIds ?? []).toEqual([])
    expect(cleared.selectedGroupId).toBeUndefined()
  })

  it('creating a focused frame yields a single interactive selection that can be deselected immediately', async () => {
    const result = await createFocusedFrame({
      canvasX: 280,
      canvasY: 420,
      presetIndex: 0,
    })
    createdFrameIds.push(result.frameId)

    const selection = await waitFor(
      () => getSelection(),
      (value) => value.selectedEntityId === result.frameId,
      'Timed out waiting for focused frame selection',
    )
    expect(selection.selectedEntityId).toBe(result.frameId)
    expect(selection.selectedEntityIds).toEqual([result.frameId])

    const overlay = await getSelectionOverlayState()
    const frameState = overlay.pages.find((page) => page.frameId === result.frameId)
    expect(frameState).toMatchObject({ interactive: true, multiSelected: false })

    await deselectSelection()

    const cleared = await getSelection()
    expect(cleared.selectedEntityIds ?? []).toEqual([])
    expect(cleared.selectedGroupId).toBeUndefined()
  })

  it('entering a group after group selection selects only its children', async () => {
    const frameIds = await createFramePair(560)

    const group = await createGroup(frameIds, 'Enter me')
    await selectPage(frameIds[0])
    await selectGroup(group.id)
    await enterGroup(group.id)

    const selection = await waitFor(
      () => getSelection(),
      (value) => (value.selectedEntityIds ?? []).sort().join(',') === [...frameIds].sort().join(','),
      'Timed out waiting for group children to become selected after entering group',
    )
    expect((selection.selectedEntityIds ?? []).sort()).toEqual([...frameIds].sort())
    expect(selection.selectedGroupId).toBeUndefined()
  })
})
