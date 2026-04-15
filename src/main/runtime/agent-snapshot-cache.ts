import type { AgentSnapshotFrame, AgentSnapshotNode } from '../../shared/types'

interface AgentSnapshotCacheEntry {
  snapshot: AgentSnapshotFrame
  nodesByRef: Map<string, AgentSnapshotNode>
}

const agentSnapshotCache = new Map<string, AgentSnapshotCacheEntry>()

export function cacheAgentSnapshot(snapshot: AgentSnapshotFrame): void {
  agentSnapshotCache.set(snapshot.frameId, {
    snapshot,
    nodesByRef: new Map(snapshot.nodes.map((node) => [node.ref, node])),
  })
}

export function getAgentSnapshot(frameId: string): AgentSnapshotFrame | null {
  return agentSnapshotCache.get(frameId)?.snapshot ?? null
}

export function resolveAgentSnapshotNode(frameId: string, ref: string): AgentSnapshotNode | null {
  return agentSnapshotCache.get(frameId)?.nodesByRef.get(ref) ?? null
}

export function invalidateAgentSnapshot(frameId: string): void {
  agentSnapshotCache.delete(frameId)
}
