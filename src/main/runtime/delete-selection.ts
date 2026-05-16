import { selectedCanvasTargets as uiSelectedCanvasTargets } from '../ui-state'
import { deleteEdges } from '../workspace-edges'
import { deletePages } from '../workspace-entities'
import { deleteGroups } from '../workspace-groups'
import {
  deleteDrawingEntity,
  deleteFileEntity,
  deleteShapeEntity,
  deleteTextEntity,
} from './document-commands'
import { requestLayout } from './viewport-control'

export function deleteSelection(): void {
  const targets = uiSelectedCanvasTargets()
  if (!targets.length) return

  const edgeIds: string[] = []
  const pageIds: string[] = []
  const textIds: string[] = []
  const fileIds: string[] = []
  const drawingIds: string[] = []
  const shapeIds: string[] = []
  const groupIds: string[] = []

  for (const target of targets) {
    switch (target.kind) {
      case 'edge':
        edgeIds.push(target.id)
        break
      case 'page':
        pageIds.push(target.id)
        break
      case 'text':
        textIds.push(target.id)
        break
      case 'file':
        fileIds.push(target.id)
        break
      case 'drawing':
        drawingIds.push(target.id)
        break
      case 'shape':
        shapeIds.push(target.id)
        break
      case 'group':
        groupIds.push(target.id)
        break
    }
  }

  if (edgeIds.length) deleteEdges({ edgeIds })
  if (pageIds.length) deletePages({ pageIds })
  for (const id of textIds) deleteTextEntity(id)
  for (const id of fileIds) deleteFileEntity(id)
  for (const id of drawingIds) deleteDrawingEntity(id)
  for (const id of shapeIds) deleteShapeEntity(id)
  if (groupIds.length) deleteGroups({ groupIds })

  const deletedEntityCount =
    pageIds.length +
    textIds.length +
    fileIds.length +
    drawingIds.length +
    shapeIds.length +
    groupIds.length
  if (!deletedEntityCount) requestLayout()
}
