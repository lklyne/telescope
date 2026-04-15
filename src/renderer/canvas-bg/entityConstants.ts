// Shared constants for canvas entity resize and layout.

export interface EntityResizePatch {
  width: number
  height: number
  canvasX?: number
  canvasY?: number
}

export type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type ResizeEdge = 'top' | 'right' | 'bottom' | 'left'

/** How Shift interacts with aspect ratio while resizing. */
export type AspectRatioResizeMode = 'off' | 'shift-unlocks' | 'shift-locks'

export const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i
export const VIDEO_EXTENSIONS = /\.(webm|mp4|mov|ogg)$/i
export const MARKDOWN_EXTENSIONS = /\.md$/i
export const WIREFRAME_EXTENSIONS = /\.wireframe\.json$/i

/** Images/videos: lock aspect unless Shift. Other files: free resize unless Shift (then lock). */
export function aspectRatioResizeModeForCanvasFile(filePath: string): AspectRatioResizeMode {
  if (IMAGE_EXTENSIONS.test(filePath) || VIDEO_EXTENSIONS.test(filePath)) return 'shift-unlocks'
  return 'shift-locks'
}

export const HANDLE_SIZE = 8

export const MIN_GROUP_WIDTH = 120
export const MIN_GROUP_HEIGHT = 80
export const MIN_TEXT_WIDTH = 100
export const MIN_TEXT_HEIGHT = 60
export const MIN_FILE_WIDTH = 80
export const MIN_FILE_HEIGHT = 80

export const CORNER_CURSORS: Record<ResizeCorner, string> = {
  'top-left': 'nwse-resize',
  'top-right': 'nesw-resize',
  'bottom-left': 'nesw-resize',
  'bottom-right': 'nwse-resize',
}

export const EDGE_CURSORS: Record<ResizeEdge, string> = {
  'top': 'ns-resize',
  'right': 'ew-resize',
  'bottom': 'ns-resize',
  'left': 'ew-resize',
}
