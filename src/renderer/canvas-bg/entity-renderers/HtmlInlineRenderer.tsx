import type { CanvasSceneFileEntity } from '../../../shared/types'
import { filePathToSrc } from './filePathToSrc'

export function HtmlInlineRenderer({ entity }: { entity: CanvasSceneFileEntity }) {
  const fileName = entity.file.split('/').pop() ?? entity.file
  return (
    <iframe
      src={filePathToSrc(entity.file)}
      title={fileName}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        pointerEvents: 'none',
        background: 'white',
      }}
    />
  )
}
