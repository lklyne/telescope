import type { CanvasSceneFileEntity } from '../../../shared/types'
import { filePathToSrc } from './filePathToSrc'

export function ImageInlineRenderer({ entity }: { entity: CanvasSceneFileEntity }) {
  const fileName = entity.file.split('/').pop() ?? entity.file
  return (
    <img
      src={filePathToSrc(entity.file)}
      alt={fileName}
      draggable={false}
      style={{
        width: '100%',
        height: '100%',
        objectFit: entity.objectFit ?? 'contain',
        pointerEvents: 'none',
      }}
    />
  )
}
