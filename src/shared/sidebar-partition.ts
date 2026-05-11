/**
 * Splits canvas items into Notes / Pages sections (see ADR 0006). Mixed groups
 * appear once per section, sharing the group id but exposing only that
 * surface's children.
 */

import { sortByStackOrder } from './entity-order-math'

export type SidebarSurface = 'notes' | 'pages'

export interface PartitionLeaf {
  id: string
  surface: SidebarSurface
  parentGroupId?: string | null
}

export interface PartitionGroup {
  id: string
  parentGroupId?: string | null
}

export interface PartitionTreeNode {
  id: string
  isGroup: boolean
  /** Number of recursive leaf descendants on this section's surface. 0 for leaves. */
  surfaceLeafCount: number
  children: PartitionTreeNode[]
}

export interface PartitionResult {
  notes: PartitionTreeNode[]
  pages: PartitionTreeNode[]
}

export function partitionSidebar(
  leaves: readonly PartitionLeaf[],
  groups: readonly PartitionGroup[],
  entityOrder: readonly string[],
): PartitionResult {
  const surfaceOf = new Map<string, SidebarSurface>()
  for (const leaf of leaves) surfaceOf.set(leaf.id, leaf.surface)

  const groupIds = new Set(groups.map((g) => g.id))

  const directLeafChildrenOf = new Map<string, string[]>()
  for (const leaf of leaves) {
    if (!leaf.parentGroupId) continue
    const list = directLeafChildrenOf.get(leaf.parentGroupId) ?? []
    list.push(leaf.id)
    directLeafChildrenOf.set(leaf.parentGroupId, list)
  }

  const childGroupsOf = new Map<string, string[]>()
  for (const group of groups) {
    if (!group.parentGroupId) continue
    const list = childGroupsOf.get(group.parentGroupId) ?? []
    list.push(group.id)
    childGroupsOf.set(group.parentGroupId, list)
  }

  const descendantLeavesOf = new Map<string, string[]>()
  function gather(groupId: string): string[] {
    const cached = descendantLeavesOf.get(groupId)
    if (cached) return cached
    const out: string[] = []
    for (const childId of directLeafChildrenOf.get(groupId) ?? []) out.push(childId)
    for (const childGroupId of childGroupsOf.get(groupId) ?? []) {
      for (const leaf of gather(childGroupId)) out.push(leaf)
    }
    descendantLeavesOf.set(groupId, out)
    return out
  }
  for (const group of groups) gather(group.id)

  function surfacesOfGroup(groupId: string): Set<SidebarSurface> {
    const out = new Set<SidebarSurface>()
    for (const leafId of descendantLeavesOf.get(groupId) ?? []) {
      const s = surfaceOf.get(leafId)
      if (s) out.add(s)
    }
    return out
  }

  function surfaceLeafCount(groupId: string, surface: SidebarSurface): number {
    let n = 0
    for (const leafId of descendantLeavesOf.get(groupId) ?? []) {
      if (surfaceOf.get(leafId) === surface) n += 1
    }
    return n
  }

  const sortFrontFirst = (ids: string[]): string[] =>
    sortByStackOrder(ids, (id) => id, entityOrder, 'front-to-back')

  function buildGroupNode(groupId: string, surface: SidebarSurface): PartitionTreeNode | null {
    const directLeaves = (directLeafChildrenOf.get(groupId) ?? []).filter(
      (id) => surfaceOf.get(id) === surface,
    )
    const directGroups = (childGroupsOf.get(groupId) ?? []).filter((id) =>
      surfacesOfGroup(id).has(surface),
    )
    const childIds = sortFrontFirst([...directLeaves, ...directGroups])
    const children: PartitionTreeNode[] = []
    for (const childId of childIds) {
      if (groupIds.has(childId)) {
        const node = buildGroupNode(childId, surface)
        if (node) children.push(node)
      } else {
        children.push({ id: childId, isGroup: false, surfaceLeafCount: 0, children: [] })
      }
    }
    return {
      id: groupId,
      isGroup: true,
      surfaceLeafCount: surfaceLeafCount(groupId, surface),
      children,
    }
  }

  function buildSection(surface: SidebarSurface): PartitionTreeNode[] {
    const rootLeafIds = leaves
      .filter((l) => !l.parentGroupId && l.surface === surface)
      .map((l) => l.id)
    const rootGroupIds = groups
      .filter((g) => !g.parentGroupId && surfacesOfGroup(g.id).has(surface))
      .map((g) => g.id)
    const orderedRoots = sortFrontFirst([...rootLeafIds, ...rootGroupIds])
    const nodes: PartitionTreeNode[] = []
    for (const id of orderedRoots) {
      if (groupIds.has(id)) {
        const node = buildGroupNode(id, surface)
        if (node) nodes.push(node)
      } else {
        nodes.push({ id, isGroup: false, surfaceLeafCount: 0, children: [] })
      }
    }
    return nodes
  }

  return { notes: buildSection('notes'), pages: buildSection('pages') }
}
