import type { AgentSnapshotPage, AgentSnapshotNode } from '../../shared/types'

interface AgentSnapshotCacheEntry {
  snapshot: AgentSnapshotPage
  nodesByRef: Map<string, AgentSnapshotNode>
}

const agentSnapshotCache = new Map<string, AgentSnapshotCacheEntry>()

export function cacheAgentSnapshot(snapshot: AgentSnapshotPage): void {
  agentSnapshotCache.set(snapshot.pageId, {
    snapshot,
    nodesByRef: new Map(snapshot.nodes.map((node) => [node.ref, node])),
  })
}

export function getAgentSnapshot(pageId: string): AgentSnapshotPage | null {
  return agentSnapshotCache.get(pageId)?.snapshot ?? null
}

export function resolveAgentSnapshotNode(pageId: string, ref: string): AgentSnapshotNode | null {
  return agentSnapshotCache.get(pageId)?.nodesByRef.get(ref) ?? null
}

export function invalidateAgentSnapshot(pageId: string): void {
  agentSnapshotCache.delete(pageId)
}
