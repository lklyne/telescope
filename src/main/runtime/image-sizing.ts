import { nativeImage } from 'electron'
import { execFileSync } from 'child_process'
import { DEFAULT_FILE_WIDTH, DEFAULT_FILE_HEIGHT } from './file-entity-state'

const DEFAULT_FALLBACK = { width: DEFAULT_FILE_WIDTH, height: DEFAULT_FILE_HEIGHT }

const VIDEO_EXTENSIONS = /\.(webm|mp4|mov|ogg)$/i

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
