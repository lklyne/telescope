/**
 * Region select orchestrator — captures a composited screenshot of a canvas
 * region and extracts React component context, then creates an annotation.
 */

import type { RegionElementGroup, WorkspaceBounds } from '../../shared/types'
import { captureRegion } from './region-capture'
import { extractRegionComponents } from './region-components'
import { createAnnotation } from '../workspace-annotations'
import { queryElementsInRect } from './frame-queries'
import { pageCanvasBounds } from './runtime-geometry'
import { frameDisplayLabel } from './runtime-serialization'

/**
 * Execute a region select: capture screenshot, extract components, create annotation.
 */
export async function executeRegionSelect(canvasRect: WorkspaceBounds, text?: string): Promise<void> {
  const { base64, intersectingPages } = await captureRegion(canvasRect, { includeBgView: true })
  const regionComponents = extractRegionComponents(intersectingPages)

  // Query DOM elements within the region for each intersecting frame.
  const regionElements: RegionElementGroup[] = []
  for (const page of intersectingPages) {
    const frameBounds = pageCanvasBounds(page)
    // Convert canvas rect to frame-local viewport coordinates.
    const viewportRect = {
      x: Math.max(0, canvasRect.x - frameBounds.x),
      y: Math.max(0, canvasRect.y - frameBounds.y),
      width:
        Math.min(canvasRect.x + canvasRect.width, frameBounds.x + frameBounds.width) -
        Math.max(canvasRect.x, frameBounds.x),
      height:
        Math.min(canvasRect.y + canvasRect.height, frameBounds.y + frameBounds.height) -
        Math.max(canvasRect.y, frameBounds.y),
    }
    try {
      const elements = await queryElementsInRect(page.id, viewportRect, 15)
      regionElements.push({
        frameId: page.id,
        frameName: frameDisplayLabel(page),
        elements,
      })
    } catch {
      // Frame may be navigating or destroyed — skip.
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
