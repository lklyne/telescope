/**
 * Pure helpers for `entityOrder` — the back-to-front paint order of canvas
 * items (entities, groups, and edges). See ADR 0006 for invariants.
 *
 * Conventions:
 * - `order[0]` is the backmost slot; `order[length - 1]` is the frontmost.
 * - `StackId` is opaque: any entity id, group id, or edge id.
 */

export type StackId = string

export interface GroupRun {
  groupId: string
  /** Recursive descendants of the group: child entities, child groups, and their descendants. */
  descendantIds: readonly StackId[]
}

/**
 * Sort `items` by their position in `entityOrder`. Stable on ties; items whose
 * ids are missing from `entityOrder` get rank -1 and fall to the back.
 *
 * `direction: 'back-to-front'` mirrors `entityOrder` itself (paint order).
 * `direction: 'front-to-back'` is the inverse — used by sidebar rendering,
 * where the frontmost item sits at the top of its section.
 */
export function sortByStackOrder<T>(
  items: readonly T[],
  getId: (item: T) => StackId,
  order: readonly StackId[],
  direction: 'back-to-front' | 'front-to-back',
): T[] {
  const rank = new Map<StackId, number>()
  for (let i = 0; i < order.length; i++) rank.set(order[i]!, i)
  const sign = direction === 'back-to-front' ? 1 : -1
  return items
    .map((item, index) => ({ item, rank: rank.get(getId(item)) ?? -1, index }))
    .sort((a, b) => sign * (a.rank - b.rank) || a.index - b.index)
    .map(({ item }) => item)
}

/**
 * Expand a selection of ids so that whenever a group id is present, the group's
 * full run (descendants) is included. Preserves the order of the input where possible.
 */
function expandSelection(
  selection: readonly StackId[],
  groups: readonly GroupRun[],
): Set<StackId> {
  const result = new Set<StackId>(selection)
  for (const id of selection) {
    const group = groups.find((g) => g.groupId === id)
    if (group) {
      for (const descendant of group.descendantIds) result.add(descendant)
    }
  }
  return result
}

/**
 * Move every id in `selection` to the frontmost slots, preserving their
 * relative order. Group ids drag their full run with them.
 */
export function bringToFront(
  order: readonly StackId[],
  selection: readonly StackId[],
  groups: readonly GroupRun[],
): StackId[] {
  const moving = expandSelection(selection, groups)
  const kept: StackId[] = []
  const lifted: StackId[] = []
  for (const id of order) {
    if (moving.has(id)) lifted.push(id)
    else kept.push(id)
  }
  return [...kept, ...lifted]
}

/**
 * Walk `order` and emit each maximal contiguous run of indices whose ids are
 * in `moving`. A run is `[startIdx, endIdx]` inclusive.
 */
function contiguousRuns(
  order: readonly StackId[],
  moving: ReadonlySet<StackId>,
): Array<[number, number]> {
  const runs: Array<[number, number]> = []
  let start = -1
  for (let i = 0; i < order.length; i++) {
    if (moving.has(order[i]!)) {
      if (start < 0) start = i
    } else if (start >= 0) {
      runs.push([start, i - 1])
      start = -1
    }
  }
  if (start >= 0) runs.push([start, order.length - 1])
  return runs
}

/**
 * Move every contiguous run of selected ids forward by one slot — i.e. swap
 * each run with the single non-moving id immediately in front of it. Runs at
 * the front of `order` stay put.
 */
export function moveForward(
  order: readonly StackId[],
  selection: readonly StackId[],
  groups: readonly GroupRun[],
): StackId[] {
  const moving = expandSelection(selection, groups)
  const result = order.slice()
  const runs = contiguousRuns(result, moving)
  // Right-to-left so swaps don't disturb earlier runs' indices.
  for (let r = runs.length - 1; r >= 0; r--) {
    const [start, end] = runs[r]!
    if (end + 1 >= result.length) continue
    const neighbor = result[end + 1]!
    result.splice(end + 1, 1)
    result.splice(start, 0, neighbor)
  }
  return result
}

/**
 * Move every contiguous run of selected ids backward by one slot — swap each
 * run with the single non-moving id immediately behind it.
 */
export function moveBackward(
  order: readonly StackId[],
  selection: readonly StackId[],
  groups: readonly GroupRun[],
): StackId[] {
  const moving = expandSelection(selection, groups)
  const result = order.slice()
  const runs = contiguousRuns(result, moving)
  for (let r = 0; r < runs.length; r++) {
    const [start, end] = runs[r]!
    if (start === 0) continue
    const neighbor = result[start - 1]!
    result.splice(start - 1, 1)
    result.splice(end, 0, neighbor)
  }
  return result
}

/**
 * Move the selection so that, relative to `anchorId`, it lands immediately
 * before (behind) or after (in front of) the anchor. Selection's relative
 * order is preserved. No-op when the anchor is part of the selection.
 */
export function moveBefore(
  order: readonly StackId[],
  selection: readonly StackId[],
  anchorId: StackId,
  position: 'before' | 'after',
  groups: readonly GroupRun[],
): StackId[] {
  const moving = expandSelection(selection, groups)
  if (moving.has(anchorId)) return order.slice()
  const movingItems: StackId[] = []
  const remainder: StackId[] = []
  for (const id of order) {
    if (moving.has(id)) movingItems.push(id)
    else remainder.push(id)
  }
  const anchorIdx = remainder.indexOf(anchorId)
  if (anchorIdx < 0) return order.slice()
  const insertAt = position === 'before' ? anchorIdx : anchorIdx + 1
  return [
    ...remainder.slice(0, insertAt),
    ...movingItems,
    ...remainder.slice(insertAt),
  ]
}

/**
 * Move every id in `selection` to the backmost slots, preserving their
 * relative order. Group ids drag their full run with them.
 */
export function sendToBack(
  order: readonly StackId[],
  selection: readonly StackId[],
  groups: readonly GroupRun[],
): StackId[] {
  const moving = expandSelection(selection, groups)
  const kept: StackId[] = []
  const lowered: StackId[] = []
  for (const id of order) {
    if (moving.has(id)) lowered.push(id)
    else kept.push(id)
  }
  return [...lowered, ...kept]
}

/**
 * Append new ids at the frontmost slot. When `parentGroupId` is supplied and
 * resolves to a known group, the new ids slot at the front of that group's
 * run — immediately behind the group id — preserving the contiguity invariant.
 *
 * Used for new-entity / new-edge creation: per ADR 0006 §8, newly created
 * items land at the top of the stack (or top of the group's run when parented).
 */
export function appendAtTop(
  order: readonly StackId[],
  newIds: readonly StackId[],
  parentGroupId?: StackId,
  groups: readonly GroupRun[] = [],
): StackId[] {
  if (newIds.length === 0) return order.slice()
  if (parentGroupId !== undefined) {
    const groupIdx = order.indexOf(parentGroupId)
    if (groupIdx >= 0) {
      return [
        ...order.slice(0, groupIdx),
        ...newIds,
        ...order.slice(groupIdx),
      ]
    }
  }
  return [...order, ...newIds]
}

/**
 * Normalise `order` so that every group's descendants plus the group id form
 * a single contiguous run, with the group id at the frontmost slot of the run.
 * Nested groups are themselves contiguous within the parent run.
 *
 * Per ADR 0006 §9, the run is pinned to the frontmost current member's index
 * (the deepest non-moving anchor), preserving the relative order of all other
 * descendants behind it. Idempotent and deterministic.
 */
export function enforceGroupContiguity(
  order: readonly StackId[],
  groups: readonly GroupRun[],
): StackId[] {
  if (groups.length === 0) return order.slice()

  const groupById = new Map<StackId, GroupRun>()
  for (const g of groups) groupById.set(g.groupId, g)

  const positionOf = new Map<StackId, number>()
  for (let i = 0; i < order.length; i++) positionOf.set(order[i]!, i)

  // For every descendant, record the deepest (innermost) group that owns it.
  const directParent = new Map<StackId, StackId>()
  for (const g of groups) {
    for (const child of g.descendantIds) {
      const existing = directParent.get(child)
      if (existing === undefined) {
        directParent.set(child, g.groupId)
      } else {
        // Pick the deeper group: the one whose id is a descendant of the other.
        const existingGroup = groupById.get(existing)
        if (existingGroup && existingGroup.descendantIds.includes(g.groupId)) {
          directParent.set(child, g.groupId)
        }
      }
    }
  }

  const anchorOf = (groupId: StackId): number => {
    const g = groupById.get(groupId)!
    let max = positionOf.get(groupId) ?? -1
    for (const d of g.descendantIds) {
      const p = positionOf.get(d)
      if (p !== undefined && p > max) max = p
    }
    return max
  }

  const effectivePos = (id: StackId): number => {
    if (groupById.has(id)) return anchorOf(id)
    return positionOf.get(id) ?? -1
  }

  const buildRun = (groupId: StackId): StackId[] => {
    const g = groupById.get(groupId)!
    const directChildren: StackId[] = []
    for (const id of g.descendantIds) {
      if (directParent.get(id) === groupId) directChildren.push(id)
    }
    directChildren.sort((a, b) => effectivePos(a) - effectivePos(b))
    const run: StackId[] = []
    for (const child of directChildren) {
      if (groupById.has(child)) run.push(...buildRun(child))
      else run.push(child)
    }
    run.push(groupId)
    return run
  }

  // Top-level groups: those not contained in any other group's descendants.
  const topLevelGroupIds: StackId[] = []
  for (const g of groups) {
    if (!directParent.has(g.groupId)) topLevelGroupIds.push(g.groupId)
  }

  // For each top-level group, emit its run when we hit its anchor index.
  const emitAtIdx = new Map<number, StackId>()
  for (const gid of topLevelGroupIds) emitAtIdx.set(anchorOf(gid), gid)

  // Ids that are claimed by some top-level group's run.
  const claimedIds = new Set<StackId>()
  for (const gid of topLevelGroupIds) {
    claimedIds.add(gid)
    const g = groupById.get(gid)!
    for (const d of g.descendantIds) claimedIds.add(d)
  }

  const result: StackId[] = []
  for (let i = 0; i < order.length; i++) {
    const gid = emitAtIdx.get(i)
    if (gid !== undefined) {
      result.push(...buildRun(gid))
    } else if (!claimedIds.has(order[i]!)) {
      result.push(order[i]!)
    }
  }
  return result
}
