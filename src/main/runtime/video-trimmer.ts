import { spawn } from 'child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join, dirname, basename } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import type { ActivitySegment } from './video-activity-tracker'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrimOptions {
  /** Path to the raw recording. */
  inputPath: string
  /** Path to the segments JSON, or segments array directly. */
  segments?: ActivitySegment[] | string
  /** Minimum idle duration (ms) to trim. Shorter idle periods are kept. Default: 3000. */
  minIdleMs?: number
  /** Instead of cutting idle completely, speed it up by this factor. 0 = cut entirely. Default: 0. */
  idleSpeedFactor?: number
  /** Output path. Defaults to input with '-trimmed' suffix. */
  outputPath?: string
}

export interface TrimResult {
  outputPath: string
  originalDuration: number
  trimmedDuration: number
  segmentsRemoved: number
  segmentsKept: number
}

// ---------------------------------------------------------------------------
// trimRecording
//
// Takes a raw WebM recording and its activity segments, removes or speeds up
// idle periods, and produces a trimmed output file.
// ---------------------------------------------------------------------------

export async function trimRecording(options: TrimOptions): Promise<TrimResult> {
  const { inputPath, minIdleMs = 3000, idleSpeedFactor = 0 } = options

  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`)
  }

  // Resolve segments.
  let segments: ActivitySegment[]
  if (Array.isArray(options.segments)) {
    segments = options.segments
  } else {
    const segmentsPath =
      typeof options.segments === 'string'
        ? options.segments
        : inputPath.replace(/\.webm$/, '-segments.json')
    if (!existsSync(segmentsPath)) {
      throw new Error(`Segments file not found: ${segmentsPath}`)
    }
    const data = JSON.parse(readFileSync(segmentsPath, 'utf-8'))
    segments = data.segments
  }

  const outputPath =
    options.outputPath ??
    join(dirname(inputPath), basename(inputPath, '.webm') + '-trimmed.webm')

  // Filter segments: keep active ones and idle ones shorter than threshold.
  const minIdleSec = minIdleMs / 1000
  const activeSegments = segments.filter(
    (s) => s.type === 'active' || s.duration < minIdleSec,
  )
  const removedSegments = segments.filter(
    (s) => s.type === 'idle' && s.duration >= minIdleSec,
  )

  if (removedSegments.length === 0) {
    // Nothing to trim — copy input to output.
    const { copyFileSync } = await import('fs')
    copyFileSync(inputPath, outputPath)
    const originalDuration = segments.reduce((sum, s) => sum + s.duration, 0)
    return {
      outputPath,
      originalDuration,
      trimmedDuration: originalDuration,
      segmentsRemoved: 0,
      segmentsKept: segments.length,
    }
  }

  if (idleSpeedFactor > 0) {
    // Speed-up approach: use ffmpeg's concat filter with setpts for idle segments.
    return trimWithSpeedup(inputPath, outputPath, segments, minIdleSec, idleSpeedFactor)
  }

  // Cut approach: extract active segments and concatenate.
  return trimByCutting(inputPath, outputPath, activeSegments, segments)
}

// ---------------------------------------------------------------------------
// Cut idle segments entirely
// ---------------------------------------------------------------------------

async function trimByCutting(
  inputPath: string,
  outputPath: string,
  activeSegments: ActivitySegment[],
  allSegments: ActivitySegment[],
): Promise<TrimResult> {
  const tmpDir = join(tmpdir(), `web-canvas-trim-${randomUUID()}`)
  const { mkdirSync } = await import('fs')
  mkdirSync(tmpDir, { recursive: true })

  const partPaths: string[] = []

  // Extract each active segment as a separate file.
  for (let i = 0; i < activeSegments.length; i++) {
    const seg = activeSegments[i]
    const partPath = join(tmpDir, `part-${i}.webm`)
    partPaths.push(partPath)

    await runFfmpeg([
      '-i', inputPath,
      '-ss', String(seg.startTime),
      '-to', String(seg.endTime),
      '-c:v', 'libvpx-vp9',
      '-crf', '20',
      '-b:v', '0',
      partPath,
    ])
  }

  // Create a concat file list.
  const concatListPath = join(tmpDir, 'concat.txt')
  const concatContent = partPaths.map((p) => `file '${p}'`).join('\n')
  writeFileSync(concatListPath, concatContent)

  // Concatenate all parts.
  await runFfmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c', 'copy',
    outputPath,
  ])

  // Clean up temp files.
  for (const p of partPaths) {
    try { unlinkSync(p) } catch { /* ignore */ }
  }
  try { unlinkSync(concatListPath) } catch { /* ignore */ }
  try {
    const { rmdirSync } = await import('fs')
    rmdirSync(tmpDir)
  } catch { /* ignore */ }

  const originalDuration = allSegments.reduce((sum, s) => sum + s.duration, 0)
  const trimmedDuration = activeSegments.reduce((sum, s) => sum + s.duration, 0)

  return {
    outputPath,
    originalDuration,
    trimmedDuration,
    segmentsRemoved: allSegments.length - activeSegments.length,
    segmentsKept: activeSegments.length,
  }
}

// ---------------------------------------------------------------------------
// Speed up idle segments instead of cutting
// ---------------------------------------------------------------------------

async function trimWithSpeedup(
  inputPath: string,
  outputPath: string,
  allSegments: ActivitySegment[],
  minIdleSec: number,
  speedFactor: number,
): Promise<TrimResult> {
  const tmpDir = join(tmpdir(), `web-canvas-trim-${randomUUID()}`)
  const { mkdirSync } = await import('fs')
  mkdirSync(tmpDir, { recursive: true })

  const partPaths: string[] = []

  for (let i = 0; i < allSegments.length; i++) {
    const seg = allSegments[i]
    const partPath = join(tmpDir, `part-${i}.webm`)
    partPaths.push(partPath)

    if (seg.type === 'idle' && seg.duration >= minIdleSec) {
      // Speed up idle segment.
      const ptsMultiplier = 1 / speedFactor
      await runFfmpeg([
        '-i', inputPath,
        '-ss', String(seg.startTime),
        '-to', String(seg.endTime),
        '-filter:v', `setpts=${ptsMultiplier}*PTS`,
        '-c:v', 'libvpx-vp9',
        '-crf', '30',
        '-b:v', '0',
        partPath,
      ])
    } else {
      // Keep active segment as-is.
      await runFfmpeg([
        '-i', inputPath,
        '-ss', String(seg.startTime),
        '-to', String(seg.endTime),
        '-c:v', 'libvpx-vp9',
        '-crf', '20',
        '-b:v', '0',
        partPath,
      ])
    }
  }

  // Concatenate.
  const concatListPath = join(tmpDir, 'concat.txt')
  writeFileSync(concatListPath, partPaths.map((p) => `file '${p}'`).join('\n'))

  await runFfmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c', 'copy',
    outputPath,
  ])

  // Clean up.
  for (const p of [...partPaths, concatListPath]) {
    try { unlinkSync(p) } catch { /* ignore */ }
  }
  try {
    const { rmdirSync } = await import('fs')
    rmdirSync(tmpDir)
  } catch { /* ignore */ }

  const originalDuration = allSegments.reduce((sum, s) => sum + s.duration, 0)
  const idleSegments = allSegments.filter((s) => s.type === 'idle' && s.duration >= minIdleSec)
  const idleTimeSaved = idleSegments.reduce(
    (sum, s) => sum + s.duration * (1 - 1 / speedFactor),
    0,
  )

  return {
    outputPath,
    originalDuration,
    trimmedDuration: originalDuration - idleTimeSaved,
    segmentsRemoved: 0,
    segmentsKept: allSegments.length,
  }
}

// ---------------------------------------------------------------------------
// ffmpeg runner
// ---------------------------------------------------------------------------

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-y', ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stderr = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`ffmpeg spawn failed: ${err.message}`))
    })
  })
}
