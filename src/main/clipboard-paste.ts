import { clipboard } from 'electron'
import { DESKTOP_PRESET_INDEX } from '../shared/constants'
import { looksLikeUrl, normalizeUserUrl } from '../shared/url'
import type {
  ClipboardEntitySelectionPayload,
  ClipboardPageSelectionPayload,
} from '../shared/types'
import { createTextEntity } from './runtime/text-entity-state'
import { getStickyDefaultColor } from './runtime/tool-defaults'
import { createFileEntity } from './runtime/document-commands'
import { saveImageBuffer } from './runtime/image-assets'
import { createPageAtPosition } from './workspace-pages'
import {
  pasteEntitiesFromClipboard,
  pastePagesFromClipboard,
} from './workspace-clipboard'

const CLIPBOARD_PREFIX_V1 = 'web-canvas:pages:'
export const CLIPBOARD_PREFIX = 'web-canvas:entities:'

function parseClipboardSelection(
  rawText: string,
): ClipboardEntitySelectionPayload | ClipboardPageSelectionPayload | null {
  if (rawText.startsWith(CLIPBOARD_PREFIX)) {
    try {
      const parsed = JSON.parse(
        rawText.slice(CLIPBOARD_PREFIX.length),
      ) as ClipboardEntitySelectionPayload
      if (parsed?.version === 2 && Array.isArray(parsed.entities)) {
        return parsed
      }
    } catch {
      // fall through
    }
  }
  if (rawText.startsWith(CLIPBOARD_PREFIX_V1)) {
    try {
      const parsed = JSON.parse(
        rawText.slice(CLIPBOARD_PREFIX_V1.length),
      ) as ClipboardPageSelectionPayload
      if (parsed?.version === 1 && Array.isArray(parsed.pages)) {
        return parsed
      }
    } catch {
      // fall through
    }
  }
  return null
}

// Smart-paste resolution order: entity JSON → URL text → image → plain text → no-op.
// Tested via tests/smoke/keyboard-shortcuts.test.ts.
export function pasteFromClipboard(input: { canvasX: number; canvasY: number }): void {
  const { canvasX, canvasY } = input

  const text = clipboard.readText()
  const payload = parseClipboardSelection(text)
  if (payload) {
    if (payload.version === 2) {
      pasteEntitiesFromClipboard({ payload, canvasX, canvasY })
    } else {
      pastePagesFromClipboard({ payload, canvasX, canvasY })
    }
    return
  }

  const trimmed = text.trim()
  if (trimmed && !trimmed.includes('\n') && looksLikeUrl(trimmed)) {
    try {
      const url = normalizeUserUrl(trimmed)
      createPageAtPosition({
        presetIndex: DESKTOP_PRESET_INDEX,
        canvasX,
        canvasY,
        mode: 'paste_url',
        focus: true,
        url,
      })
      return
    } catch {
      // Not a valid URL after normalisation — fall through.
    }
  }

  const clipImage = clipboard.readImage()
  if (!clipImage.isEmpty()) {
    const file = saveImageBuffer(clipImage.toPNG(), 'png')
    const { width, height } = clipImage.getSize()
    createFileEntity({ canvasX, canvasY, file, width, height })
    return
  }

  if (trimmed) {
    createTextEntity({
      canvasX,
      canvasY,
      text: trimmed,
      textStyle: 'sticky',
      color: getStickyDefaultColor(),
    })
  }
}
