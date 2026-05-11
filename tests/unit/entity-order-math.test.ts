import { describe, expect, it } from 'vitest'
import {
  appendAtTop,
  bringToFront,
  enforceGroupContiguity,
  moveBackward,
  moveBefore,
  moveForward,
  sendToBack,
} from '../../src/shared/entity-order-math'

describe('entity-order-math', () => {
  describe('bringToFront', () => {
    it('moves a single id to the frontmost slot', () => {
      const order = ['a', 'b', 'c', 'd']
      expect(bringToFront(order, ['b'], [])).toEqual(['a', 'c', 'd', 'b'])
    })
  })

  describe('sendToBack', () => {
    it('moves a single id to the backmost slot', () => {
      const order = ['a', 'b', 'c', 'd']
      expect(sendToBack(order, ['c'], [])).toEqual(['c', 'a', 'b', 'd'])
    })
  })

  describe('moveForward', () => {
    it('swaps with the next-frontmost neighbor', () => {
      const order = ['a', 'b', 'c', 'd']
      expect(moveForward(order, ['b'], [])).toEqual(['a', 'c', 'b', 'd'])
    })

    it('is a no-op when the id is already frontmost', () => {
      const order = ['a', 'b', 'c']
      expect(moveForward(order, ['c'], [])).toEqual(['a', 'b', 'c'])
    })
  })

  describe('moveBackward', () => {
    it('swaps with the next-backmost neighbor', () => {
      const order = ['a', 'b', 'c', 'd']
      expect(moveBackward(order, ['c'], [])).toEqual(['a', 'c', 'b', 'd'])
    })

    it('is a no-op when the id is already backmost', () => {
      const order = ['a', 'b', 'c']
      expect(moveBackward(order, ['a'], [])).toEqual(['a', 'b', 'c'])
    })
  })

  describe('moveBefore', () => {
    it('inserts the selection immediately behind the anchor', () => {
      const order = ['a', 'b', 'c', 'd']
      // Drop 'd' to land behind 'b' (i.e. at b's current slot).
      expect(moveBefore(order, ['d'], 'b', 'before', [])).toEqual([
        'a',
        'd',
        'b',
        'c',
      ])
    })

    it('inserts the selection immediately in front of the anchor', () => {
      const order = ['a', 'b', 'c', 'd']
      expect(moveBefore(order, ['a'], 'c', 'after', [])).toEqual([
        'b',
        'c',
        'a',
        'd',
      ])
    })

    it('is a no-op when the anchor is in the selection', () => {
      const order = ['a', 'b', 'c']
      expect(moveBefore(order, ['b'], 'b', 'before', [])).toEqual([
        'a',
        'b',
        'c',
      ])
    })
  })

  describe('multi-selection block moves', () => {
    it('bringToFront preserves the relative order of the selection', () => {
      const order = ['a', 'b', 'c', 'd', 'e']
      // Selecting 'd' then 'b' must not reorder them — `d` was in front of `b`,
      // so the front block ends `…, b, d`.
      expect(bringToFront(order, ['d', 'b'], [])).toEqual([
        'a',
        'c',
        'e',
        'b',
        'd',
      ])
    })

    it('sendToBack preserves the relative order of the selection', () => {
      const order = ['a', 'b', 'c', 'd', 'e']
      expect(sendToBack(order, ['d', 'b'], [])).toEqual([
        'b',
        'd',
        'a',
        'c',
        'e',
      ])
    })

    it('moveBefore collects scattered selection contiguously at the anchor', () => {
      const order = ['a', 'b', 'c', 'd', 'e']
      expect(moveBefore(order, ['a', 'c'], 'e', 'before', [])).toEqual([
        'b',
        'd',
        'a',
        'c',
        'e',
      ])
    })
  })

  describe('group selection moves the whole run', () => {
    it('bringToFront on a group id moves the group and all descendants', () => {
      const order = ['a', 'x', 'y', 'g', 'b']
      const groups = [{ groupId: 'g', descendantIds: ['x', 'y'] }]
      expect(bringToFront(order, ['g'], groups)).toEqual([
        'a',
        'b',
        'x',
        'y',
        'g',
      ])
    })

    it('sendToBack on a group id moves the run to the back as a block', () => {
      const order = ['a', 'b', 'x', 'y', 'g']
      const groups = [{ groupId: 'g', descendantIds: ['x', 'y'] }]
      expect(sendToBack(order, ['g'], groups)).toEqual([
        'x',
        'y',
        'g',
        'a',
        'b',
      ])
    })

    it('moveForward on a group id slides the whole run forward by one', () => {
      const order = ['a', 'x', 'y', 'g', 'b']
      const groups = [{ groupId: 'g', descendantIds: ['x', 'y'] }]
      expect(moveForward(order, ['g'], groups)).toEqual([
        'a',
        'b',
        'x',
        'y',
        'g',
      ])
    })
  })

  describe('enforceGroupContiguity', () => {
    it('pulls scattered group members into a single contiguous run', () => {
      // 'g' has descendants 'x','y','z' but they are scattered.
      const order = ['x', 'a', 'y', 'b', 'z', 'g']
      const groups = [{ groupId: 'g', descendantIds: ['x', 'y', 'z'] }]
      // Pin the run to the frontmost current member's index. The frontmost
      // member is 'g' at index 5. Descendants slot in behind 'g' in their
      // original relative order: x, y, z. Final run lives at indices 3..5.
      expect(enforceGroupContiguity(order, groups)).toEqual([
        'a',
        'b',
        'x',
        'y',
        'z',
        'g',
      ])
    })

    it('places the group id at the frontmost slot of its run', () => {
      // 'g' starts behind its members. After enforcement, 'g' is at the front
      // of the run.
      const order = ['g', 'x', 'y']
      const groups = [{ groupId: 'g', descendantIds: ['x', 'y'] }]
      expect(enforceGroupContiguity(order, groups)).toEqual(['x', 'y', 'g'])
    })

    it('is a no-op when the invariant already holds', () => {
      const order = ['a', 'x', 'y', 'g', 'b']
      const groups = [{ groupId: 'g', descendantIds: ['x', 'y'] }]
      expect(enforceGroupContiguity(order, groups)).toEqual(order)
    })

    it('is idempotent — running twice produces the same result as once', () => {
      const order = ['x', 'a', 'y', 'b', 'z', 'g']
      const groups = [{ groupId: 'g', descendantIds: ['x', 'y', 'z'] }]
      const once = enforceGroupContiguity(order, groups)
      const twice = enforceGroupContiguity(once, groups)
      expect(twice).toEqual(once)
    })

    it('keeps a nested child group contiguous within the parent run', () => {
      // 'parent' contains 'child', 'a'. 'child' contains 'm','n'.
      // descendantIds is recursive: parent → [a, child, m, n], child → [m, n].
      const order = ['m', 'outside', 'a', 'n', 'child', 'parent']
      const groups = [
        { groupId: 'parent', descendantIds: ['a', 'child', 'm', 'n'] },
        { groupId: 'child', descendantIds: ['m', 'n'] },
      ]
      const result = enforceGroupContiguity(order, groups)
      // The parent's run must be contiguous and end at 'parent'.
      const parentIdx = result.indexOf('parent')
      const runIds = new Set(['a', 'child', 'm', 'n', 'parent'])
      for (let i = parentIdx - 4; i <= parentIdx; i++) {
        expect(runIds.has(result[i]!)).toBe(true)
      }
      // Child's sub-run must also be contiguous and end at 'child'.
      const childIdx = result.indexOf('child')
      const childRunIds = new Set(['m', 'n', 'child'])
      for (let i = childIdx - 2; i <= childIdx; i++) {
        expect(childRunIds.has(result[i]!)).toBe(true)
      }
      // 'outside' is not part of the parent run.
      const outsideIdx = result.indexOf('outside')
      expect(
        outsideIdx < parentIdx - 4 || outsideIdx > parentIdx,
      ).toBe(true)
    })

    it('preserves the relative order of descendants within the run', () => {
      // The frontmost member among descendants is 'y' at index 4. The order of
      // descendants behind 'g' should follow their original positions: x, z, y.
      const order = ['x', 'a', 'z', 'b', 'y', 'g']
      const groups = [{ groupId: 'g', descendantIds: ['x', 'y', 'z'] }]
      expect(enforceGroupContiguity(order, groups)).toEqual([
        'a',
        'b',
        'x',
        'z',
        'y',
        'g',
      ])
    })
  })

  describe('appendAtTop', () => {
    it('places new ids at the frontmost slots of a flat order', () => {
      const order = ['a', 'b', 'c']
      expect(appendAtTop(order, ['new1', 'new2'])).toEqual([
        'a',
        'b',
        'c',
        'new1',
        'new2',
      ])
    })

    it('slots new ids at the front of the parent group run, just behind the group id', () => {
      const order = ['a', 'x', 'y', 'g', 'b']
      const groups = [{ groupId: 'g', descendantIds: ['x', 'y'] }]
      // New entity parented to 'g' should land immediately behind 'g'.
      expect(appendAtTop(order, ['new1'], 'g', groups)).toEqual([
        'a',
        'x',
        'y',
        'new1',
        'g',
        'b',
      ])
    })

    it('falls back to top-of-stack when the named parent group is unknown', () => {
      const order = ['a', 'b']
      expect(appendAtTop(order, ['new1'], 'missing-group', [])).toEqual([
        'a',
        'b',
        'new1',
      ])
    })
  })

  describe('edge ids interleave with entity ids', () => {
    it('treats edge ids as ordinary stack ids in mutations', () => {
      const order = ['entity-a', 'edge-1', 'entity-b', 'edge-2']
      // No groups; selection contains an edge id.
      expect(bringToFront(order, ['edge-1'], [])).toEqual([
        'entity-a',
        'entity-b',
        'edge-2',
        'edge-1',
      ])
    })

    it('appendAtTop places new edges at the top of the stack', () => {
      const order = ['entity-a', 'entity-b']
      expect(appendAtTop(order, ['edge-new'])).toEqual([
        'entity-a',
        'entity-b',
        'edge-new',
      ])
    })
  })
})
