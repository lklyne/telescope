import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { nativeImage, screen as electronScreen } from 'electron'
import type { Route } from './types'
import { findPageById } from '../runtime/runtime-context'
import { win } from '../runtime/window-shell'
import { startRecording, stopRecording, getRecordingState } from '../runtime/video-recorder'
import { trimRecording } from '../runtime/video-trimmer'
import { writeJson } from './http-helpers'

const execFileAsync = promisify(execFile)

export const recordingRoutes: Route[] = [
  {
    method: 'POST',
    pattern: '/recording/start',
    async handler({ response, body }) {
      try {
        const payload = body as {
          pageId?: string
          outputPath?: string
          fps?: number
          quality?: 'high' | 'medium' | 'compact'
        }
        if (!payload.pageId) {
          writeJson(response, 400, { error: 'pageId is required' })
          return
        }
        const page = findPageById(payload.pageId)
        if (!page) {
          writeJson(response, 404, { error: `Page not found: ${payload.pageId}` })
          return
        }
        const result = await startRecording({
          page,
          outputPath: payload.outputPath,
          fps: payload.fps,
          quality: payload.quality,
        })
        writeJson(response, 200, result)
      } catch (error) {
        writeJson(response, 500, { error: error instanceof Error ? error.message : 'Failed to start recording' })
      }
    },
  },
  {
    method: 'POST',
    pattern: '/recording/stop',
    async handler({ response }) {
      try {
        const result = await stopRecording()
        writeJson(response, 200, result)
      } catch (error) {
        writeJson(response, 500, { error: error instanceof Error ? error.message : 'Failed to stop recording' })
      }
    },
  },
  {
    method: 'GET',
    pattern: '/recording/status',
    async handler({ response }) {
      writeJson(response, 200, getRecordingState())
    },
  },
  {
    method: 'POST',
    pattern: '/recording/trim',
    async handler({ response, body }) {
      try {
        const payload = body as {
          inputPath: string
          minIdleMs?: number
          idleSpeedFactor?: number
          outputPath?: string
        }
        if (!payload.inputPath) {
          writeJson(response, 400, { error: 'inputPath is required' })
          return
        }
        const result = await trimRecording({
          inputPath: payload.inputPath,
          minIdleMs: payload.minIdleMs,
          idleSpeedFactor: payload.idleSpeedFactor,
          outputPath: payload.outputPath,
        })
        writeJson(response, 200, result)
      } catch (error) {
        writeJson(response, 500, { error: error instanceof Error ? error.message : 'Trim failed' })
      }
    },
  },
  {
    method: 'POST',
    pattern: '/window/screenshot',
    async handler({ response }) {
      if (!win || win.isDestroyed()) {
        writeJson(response, 500, { error: 'Window not available' })
        return
      }
      const tmpPath = join(tmpdir(), `specular-window-${Date.now()}.png`)
      const windowId = win.getMediaSourceId().split(':')[1]
      if (!/^\d+$/.test(windowId)) {
        writeJson(response, 500, { error: 'Invalid window ID' })
        return
      }
      const origBounds = win.getBounds()
      try {
        const display = electronScreen.getDisplayMatching(origBounds)
        const captureW = Math.min(display.workAreaSize.width, 2560)
        const captureH = Math.min(display.workAreaSize.height, 1440)
        win.setBounds({ x: origBounds.x, y: origBounds.y, width: captureW, height: captureH })
        await new Promise((r) => setTimeout(r, 300))
        await execFileAsync('screencapture', ['-r', '-l', windowId, '-o', '-x', tmpPath])
        const data = readFileSync(tmpPath)
        writeJson(response, 200, { base64: data.toString('base64'), mimeType: 'image/png', width: captureW, height: captureH })
      } catch (error) {
        writeJson(response, 500, { error: error instanceof Error ? error.message : 'Screenshot failed' })
      } finally {
        if (!win.isDestroyed()) win.setBounds(origBounds)
        rmSync(tmpPath, { force: true })
      }
    },
  },
]
