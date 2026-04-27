import type { CanvasSceneFileEntity } from '../../../shared/types'
import {
  IMAGE_EXTENSIONS,
  MARKDOWN_EXTENSIONS,
  VIDEO_EXTENSIONS,
  WIREFRAME_EXTENSIONS,
} from '../entityConstants'
import { ComponentPlaceholderRenderer } from './ComponentPlaceholderRenderer'
import { FileFallbackRenderer } from './FileFallbackRenderer'
import { ImageInlineRenderer } from './ImageInlineRenderer'
import { MarkdownInlineRenderer } from './MarkdownInlineRenderer'
import { VideoInlineRenderer } from './VideoInlineRenderer'
import { WireframeInlineRenderer } from './WireframeInlineRenderer'

/**
 * Pick the inline renderer for a file entity. The registry's rendererTag
 * (broadcast in scene data) is the canonical source; the extension regex
 * is a defensive backstop for entities that haven't been re-broadcast
 * since boot.
 */
function resolveTag(entity: CanvasSceneFileEntity): CanvasSceneFileEntity['rendererTag'] {
  if (entity.rendererTag) return entity.rendererTag
  if (IMAGE_EXTENSIONS.test(entity.file)) return 'image'
  if (VIDEO_EXTENSIONS.test(entity.file)) return 'video'
  if (WIREFRAME_EXTENSIONS.test(entity.file)) return 'wireframe'
  if (MARKDOWN_EXTENSIONS.test(entity.file)) return 'markdown'
  return undefined
}

export function RendererSwitch({
  entity,
  canEdit,
  isDark,
  wireframeJsonMode,
  onTextEditingChange,
}: {
  entity: CanvasSceneFileEntity
  canEdit: boolean
  isDark: boolean
  wireframeJsonMode: boolean
  onTextEditingChange: (active: boolean) => void
}) {
  const tag = resolveTag(entity)
  switch (tag) {
    case 'image':
      return <ImageInlineRenderer entity={entity} />
    case 'video':
      return <VideoInlineRenderer entity={entity} canEdit={canEdit} />
    case 'markdown':
      return (
        <MarkdownInlineRenderer
          entity={entity}
          canEdit={canEdit}
          isDark={isDark}
          onTextEditingChange={onTextEditingChange}
        />
      )
    case 'wireframe':
      return (
        <WireframeInlineRenderer
          entity={entity}
          canEdit={canEdit}
          isDark={isDark}
          jsonMode={wireframeJsonMode}
        />
      )
    case 'component':
      return <ComponentPlaceholderRenderer entity={entity} isDark={isDark} />
    default:
      return <FileFallbackRenderer entity={entity} isDark={isDark} />
  }
}

/** Whether the resolved renderer is one that suppresses drag-from-content. */
export function rendererSuppressesContentDrag(entity: CanvasSceneFileEntity): boolean {
  const tag = resolveTag(entity)
  return tag === 'markdown' || tag === 'video' || tag === 'wireframe'
}
