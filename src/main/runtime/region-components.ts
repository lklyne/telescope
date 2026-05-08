/**
 * Extracts React component context for a canvas region.
 *
 * For each page intersecting the region, walks the cached component tree
 * and collects components with source locations, deduplicated by name + source.
 */

import type {
  ComponentTreeNode,
  RegionComponentGroup,
  SourceLocation,
} from '../../shared/types'
import { pageDisplayLabel } from './runtime-serialization'
import type { Page } from './runtime-entities'

interface ComponentEntry {
  name: string
  sourceLocation?: SourceLocation
  count: number
}

function collectComponents(
  tree: ComponentTreeNode[],
  detailCache: Record<string, { sourceLocation?: SourceLocation }> | undefined,
): ComponentEntry[] {
  const map = new Map<string, ComponentEntry>()

  function walk(node: ComponentTreeNode): void {
    if (node.hasSource) {
      const source = detailCache?.[node.id]?.sourceLocation
      const key = source
        ? `${node.componentName}:${source.file}:${source.line ?? ''}`
        : node.componentName
      const existing = map.get(key)
      if (existing) {
        existing.count++
      } else {
        map.set(key, {
          name: node.componentName,
          sourceLocation: source
            ? { file: source.file, line: source.line, column: source.column }
            : undefined,
          count: 1,
        })
      }
    }
    for (const child of node.children) {
      walk(child)
    }
  }

  for (const root of tree) {
    walk(root)
  }

  return Array.from(map.values())
}

/**
 * Extract component context from intersecting pages.
 *
 * Uses the cached component tree (populated on every React commit) and
 * any already-resolved source locations from inspectDetailsByNodeId.
 */
export function extractRegionComponents(
  intersectingPages: Page[],
): RegionComponentGroup[] {
  const groups: RegionComponentGroup[] = []

  for (const page of intersectingPages) {
    const components = page.componentTree?.length
      ? collectComponents(page.componentTree, page.inspectDetailsByNodeId)
      : []

    groups.push({
      pageId: page.id,
      pageName: pageDisplayLabel(page),
      components,
    })
  }

  return groups
}
