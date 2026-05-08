/**
 * Region select orchestrator — captures a composited screenshot of a canvas
 * region and extracts React component context, then creates an annotation.
 */

import type { RegionElementGroup, WorkspaceBounds } from '../../shared/types'
import { captureRegion } from './region-capture'
import { extractRegionComponents } from './region-components'
import { createAnnotation } from '../workspace-annotations'
import { queryElementsInRect } from './page-queries'
import { pageCanvasBounds } from './runtime-geometry'
import { pageDisplayLabel } from './runtime-serialization'

/**
 * Execute a region select: capture screenshot, extract components, create annotation.
 */
export async function executeRegionSelect(canvasRect: WorkspaceBounds, text?: string): Promise<void> {
  const { base64, intersectingPages } = await captureRegion(canvasRect, { includeBgView: true })
  const regionComponents = extractRegionComponents(intersectingPages)

  // Query DOM elements within the region for each intersecting page.
  const regionElements: RegionElementGroup[] = []
  for (const page of intersectingPages) {
    const pageBounds = pageCanvasBounds(page)
    // Convert canvas rect to page-local viewport coordinates.
    const viewportRect = {
      x: Math.max(0, canvasRect.x - pageBounds.x),
      y: Math.max(0, canvasRect.y - pageBounds.y),
      width:
        Math.min(canvasRect.x + canvasRect.width, pageBounds.x + pageBounds.width) -
        Math.max(canvasRect.x, pageBounds.x),
      height:
        Math.min(canvasRect.y + canvasRect.height, pageBounds.y + pageBounds.height) -
        Math.max(canvasRect.y, pageBounds.y),
    }
    try {
      const elements = await queryElementsInRect(page.id, viewportRect, 15)
      regionElements.push({
        pageId: page.id,
        pageName: pageDisplayLabel(page),
        elements,
      })
    } catch {
      // Page may be navigating or destroyed — skip.
    }
  }

  createAnnotation({
    anchor: { type: 'region', canvasRect },
    author: 'user',
    text: text ?? '',
    kind: 'region_select',
    metadata: {
      regionScreenshot: base64,
      regionComponents,
      regionElements,
    },
  })
}
