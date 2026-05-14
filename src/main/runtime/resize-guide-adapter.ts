import type { AlignmentReferenceName } from '../../shared/canvas-guides'
import type { ResizeHandle } from '../../shared/resize-accumulator'

export function resizeGuideReferencesForHandle(handle: ResizeHandle): AlignmentReferenceName[] {
  switch (handle) {
    case 'n':
      return ['top']
    case 's':
      return ['bottom']
    case 'e':
      return ['right']
    case 'w':
      return ['left']
    case 'ne':
      return ['top', 'right']
    case 'nw':
      return ['top', 'left']
    case 'se':
      return ['bottom', 'right']
    case 'sw':
      return ['bottom', 'left']
  }
}
