import { describe, expect, it } from 'vitest'
import type { CanvasSceneGroupEntity, LayoutUpdateData } from '../../src/shared/types'
import {
  descendantIdsForGroup,
  selectedGroupHasDescendantFrame,
  selectedGroupDragTargetId,
} from '../../src/renderer/canvas-bg/groupMembership'

function group(
  id: string,
  entityIds: string[],
  parentGroupId?: string,
): CanvasSceneGroupEntity {
  return {
    kind: 'group',
    id,
    label: id,
    canvasX: 0,
    canvasY: 0,
    width: 100,
    height: 100,
    screenX: 0,
    screenY: 0,
    screenWidth: 100,
    screenHeight: 100,
    parentGroupId,
    layoutMode: 'freeform',
    managedLayout: false,
    entityIds,
  }
}

describe('groupMembership', () => {
  it('collects direct and nested group descendants', () => {
    const groups = [
      group('parent', ['frame-1', 'child']),
      group('child', ['text-1'], 'parent'),
    ]

    expect(descendantIdsForGroup(groups, 'parent')).toEqual(
      new Set(['frame-1', 'child', 'text-1']),
    )
  })

  it('resolves a selected group drag target for descendants', () => {
    const groups = [
      group('parent', ['frame-1', 'child']),
      group('child', ['file-1'], 'parent'),
    ]

    expect(selectedGroupDragTargetId({ groups, selectedGroupId: 'parent' }, 'file-1')).toBe(
      'parent',
    )
    expect(selectedGroupDragTargetId({ groups, selectedGroupId: 'parent' }, 'other')).toBeNull()
    expect(selectedGroupDragTargetId({ groups, selectedGroupId: null }, 'file-1')).toBeNull()
  })

  it('detects when the selected group owns frame content', () => {
    const groups = [
      group('parent', ['child']),
      group('child', ['frame-1'], 'parent'),
    ]
    const entities = [
      { kind: 'frame', id: 'frame-1' },
      { kind: 'text', id: 'text-1' },
    ] as LayoutUpdateData['entities']

    expect(selectedGroupHasDescendantFrame({ entities, groups, selectedGroupId: 'parent' })).toBe(
      true,
    )
    expect(selectedGroupHasDescendantFrame({ entities, groups, selectedGroupId: 'child' })).toBe(
      true,
    )
    expect(selectedGroupHasDescendantFrame({ entities, groups, selectedGroupId: null })).toBe(
      false,
    )
  })
})
