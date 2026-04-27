import type { CanvasSceneFileEntity } from '../../../shared/types'
import { filePathToSrc } from './filePathToSrc'

export function VideoInlineRenderer({
  entity,
  canEdit,
}: {
  entity: CanvasSceneFileEntity
  canEdit: boolean
}) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <video
        src={filePathToSrc(entity.file)}
        autoPlay
        loop
        muted
        controls={canEdit}
        playsInline
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: entity.objectFit ?? 'contain',
        }}
      />
      {!canEdit && <div style={{ position: 'absolute', inset: 0 }} />}
    </div>
  )
}
