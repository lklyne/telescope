import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Content block type from browse handler
// ---------------------------------------------------------------------------

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

export function printText(text: string): void {
  process.stdout.write(text + '\n')
}

export function printError(message: string): void {
  process.stderr.write(`error: ${message}\n`)
}

/** Write a base64-encoded image to a temp file and print the path plus a next-step hint. */
export function writeImageBlock(block: { data: string; mimeType: string }): void {
  const ext = block.mimeType === 'image/jpeg' ? '.jpg' : '.png'
  const filePath = join(tmpdir(), `specular-${randomUUID()}${ext}`)
  writeFileSync(filePath, Buffer.from(block.data, 'base64'))
  printText(filePath)
  printText(`(image: use Read("${filePath}") to view)`)
}

/** Print browse handler content blocks: text to stdout, images to temp files. */
export function printContentBlocks(blocks: ContentBlock[]): void {
  for (const block of blocks) {
    if (block.type === 'text') {
      printText(block.text)
    } else if (block.type === 'image') {
      writeImageBlock(block)
    }
  }
}
