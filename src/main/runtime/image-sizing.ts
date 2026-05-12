import { nativeImage } from 'electron'
import { execFileSync } from 'child_process'
import { HTML_EXTENSIONS, VIDEO_EXTENSIONS } from '../../shared/file-extensions'
import { DESKTOP_PRESET_INDEX, deviceForPresetIndex } from '../../shared/device-catalog'
import { DEFAULT_FILE_WIDTH, DEFAULT_FILE_HEIGHT } from './file-entity-state'

const DEFAULT_FALLBACK = { width: DEFAULT_FILE_WIDTH, height: DEFAULT_FILE_HEIGHT }

export function imageSizeFromBuffer(buffer: Buffer): { width: number; height: number } {
  const img = nativeImage.createFromBuffer(buffer)
  if (img.isEmpty()) return DEFAULT_FALLBACK
  return img.getSize()
}

export function imageSizeFromPath(filePath: string): { width: number; height: number } | null {
  const img = nativeImage.createFromPath(filePath)
  if (img.isEmpty()) return null
  return img.getSize()
}

// HTML files have no intrinsic pixel dimensions. Default to the Desktop
// viewport preset so charts, mockups, and generated viz land readably.
export function htmlDefaultSize(filePath: string): { width: number; height: number } | null {
  if (!HTML_EXTENSIONS.test(filePath)) return null
  const desktop = deviceForPresetIndex(DESKTOP_PRESET_INDEX)
  if (!desktop) return null
  return { width: desktop.viewport.width, height: desktop.viewport.height }
}

export function videoSizeFromPath(filePath: string): { width: number; height: number } | null {
  if (!VIDEO_EXTENSIONS.test(filePath)) return null
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'json',
      filePath,
    ], { timeout: 5000 }).toString()
    const { streams } = JSON.parse(out) as { streams: Array<{ width: number; height: number }> }
    if (streams?.[0]?.width && streams?.[0]?.height) {
      return { width: streams[0].width, height: streams[0].height }
    }
    return null
  } catch {
    return null
  }
}
