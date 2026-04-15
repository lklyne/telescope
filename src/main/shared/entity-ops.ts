import type { BatchLayoutMode } from '../../shared/types'
import {
  LAPTOP_PRESET_INDEX,
  VIEWPORT_PRESETS,
  defaultOrientationForDevice,
  deviceForPresetIndex,
  sizeForOrientation,
} from '../../shared/device-catalog'
import { normalizeUserUrl } from '../../shared/url'
import { callApp } from './app-client'

// ---------------------------------------------------------------------------
// Long-text → file entity auto-routing
// ---------------------------------------------------------------------------

const LONG_TEXT_THRESHOLD = 300

function shouldRouteToFile(text: string): boolean {
  if (text.length > LONG_TEXT_THRESHOLD) return true
  return /^#{1,6}\s/m.test(text)
    || /^\|.+\|/m.test(text)
    || /```/.test(text)
}

function deriveNoteName(text: string): string {
  const heading = text.match(/^#{1,6}\s+(.+)/m)
  if (heading) return heading[1].slice(0, 60)
  return text.split('\n')[0].trim().slice(0, 60) || 'Note'
}

// ---------------------------------------------------------------------------
// Upsert entities
// ---------------------------------------------------------------------------

export interface UpsertOptions {
  layout?: BatchLayoutMode
  gap?: number
}

export async function upsertEntities(
  items: Array<Record<string, unknown>>,
  options?: UpsertOptions,
): Promise<{ created: string[]; updated: string[] }> {
  const results: { created: string[]; updated: string[] } = { created: [], updated: [] }

  // Single-pass grouping
  const frameCreates: Array<Record<string, unknown>> = []
  const frameUpdates: Array<Record<string, unknown>> = []
  const textCreates: Array<Record<string, unknown>> = []
  const textUpdates: Array<Record<string, unknown>> = []
  const fileCreates: Array<Record<string, unknown>> = []
  const fileUpdates: Array<Record<string, unknown>> = []
  const noteCreates: Array<Record<string, unknown>> = []
  for (const item of items) {
    // Auto-route long/structured text to .md file entity
    if (
      !item.id
      && item.kind === 'text'
      && !item.forceKind
      && typeof item.text === 'string'
      && (item._forceFile || shouldRouteToFile(item.text))
    ) {
      noteCreates.push(item)
      continue
    }
    const bucket = item.kind === 'frame'
      ? (item.id ? frameUpdates : frameCreates)
      : item.kind === 'text'
        ? (item.id ? textUpdates : textCreates)
        : (item.id ? fileUpdates : fileCreates)
    bucket.push(item)
  }

  // Batch-place items that lack explicit positions
  const allCreates = [...frameCreates, ...textCreates, ...fileCreates, ...noteCreates]
  const needsPlacement = allCreates.filter(
    (item) => item.canvasX === undefined || item.canvasY === undefined,
  )
  if (needsPlacement.length > 0) {
    const sizes = needsPlacement.map((item) => {
      if (item.kind === 'frame') {
        const presetIndex = (item.presetIndex as number | undefined) ?? LAPTOP_PRESET_INDEX
        const preset = VIEWPORT_PRESETS[presetIndex]
        const w = preset?.width ?? 1280
        const h = preset?.height ?? 800
        const device = deviceForPresetIndex(presetIndex)
        const orientation =
          (item.orientation as 'portrait' | 'landscape' | undefined) ??
          defaultOrientationForDevice(device)
        return sizeForOrientation(w, h, orientation)
      }
      return {
        width: Number(item.width) || 200,
        height: Number(item.height) || 200,
      }
    })
    const placement = await callApp<{ positions: Array<{ canvasX: number; canvasY: number }> }>(
      '/layout/batch-placement',
      {
        method: 'POST',
        body: JSON.stringify({
          items: sizes,
          layout: options?.layout,
          gap: options?.gap,
          anchor: 'selection_or_empty_region',
        }),
      },
    )
    for (let i = 0; i < needsPlacement.length; i++) {
      needsPlacement[i].canvasX = placement.positions[i].canvasX
      needsPlacement[i].canvasY = placement.positions[i].canvasY
    }
  }

  // Prepare new frames with device metadata
  const preparedFrameCreates = frameCreates.map((item) => {
    if (typeof item.url === 'string') {
      item.url = normalizeUserUrl(item.url)
    }
    const device = deviceForPresetIndex(item.presetIndex as number)
    const orientation = (item.orientation as string) ?? defaultOrientationForDevice(device)
    const metadata: Record<string, unknown> = {
      ...(item.metadata as Record<string, unknown> ?? {}),
      deviceId: device?.id ?? null,
      deviceOrientation: orientation,
      showDeviceFrame: item.showDeviceFrame !== false,
    }
    const { orientation: _o, showDeviceFrame: _s, kind: _k, ...rest } = item
    return { ...rest, metadata }
  })

  const extractIds = (result: { items?: Array<{ id: string }>; id?: string }): string[] =>
    result.items?.map((i) => i.id) ?? (result.id ? [result.id] : [])

  const pickDefined = (obj: Record<string, unknown>, keys: string[]): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k]
    return out
  }

  // Fire all independent API calls concurrently
  const ops: Array<Promise<void>> = []

  if (preparedFrameCreates.length) {
    ops.push(callApp<{ frameIds?: string[] }>('/frames/create', {
      method: 'POST',
      body: JSON.stringify({ frames: preparedFrameCreates }),
    }).then((r) => { results.created.push(...(r.frameIds ?? [])) }))
  }
  if (frameUpdates.length) {
    ops.push(callApp<{ updated?: string[] }>('/frames/update', {
      method: 'POST',
      body: JSON.stringify({ frames: frameUpdates }),
    }).then((r) => { results.updated.push(...(r.updated ?? [])) }))
  }
  if (textCreates.length) {
    const textItems = textCreates.map((t) => pickDefined(t, ['canvasX', 'canvasY', 'text', 'color', 'width', 'height']))
    ops.push(callApp<{ items?: Array<{ id: string }>; id?: string }>('/text-entities/create', {
      method: 'POST',
      body: JSON.stringify({ items: textItems }),
    }).then((r) => { results.created.push(...extractIds(r)) }))
  }
  if (textUpdates.length) {
    const updateItems = textUpdates.map((t) => ({
      id: t.id,
      patch: pickDefined(t, ['text', 'color', 'width', 'height', 'canvasX', 'canvasY']),
    }))
    ops.push(callApp('/text-entities/update', {
      method: 'POST',
      body: JSON.stringify({ items: updateItems }),
    }).then(() => { results.updated.push(...textUpdates.map((t) => t.id as string)) }))
  }
  if (fileCreates.length) {
    const fileItems = fileCreates.map((f) => pickDefined(f, ['canvasX', 'canvasY', 'file', 'subpath', 'width', 'height']))
    ops.push(callApp<{ items?: Array<{ id: string }>; id?: string }>('/file-entities/create', {
      method: 'POST',
      body: JSON.stringify({ items: fileItems }),
    }).then((r) => { results.created.push(...extractIds(r)) }))
  }
  if (fileUpdates.length) {
    const updateItems = fileUpdates.map((f) => ({
      id: f.id,
      patch: pickDefined(f, ['file', 'subpath', 'width', 'height', 'canvasX', 'canvasY']),
    }))
    ops.push(callApp('/file-entities/update', {
      method: 'POST',
      body: JSON.stringify({ items: updateItems }),
    }).then(() => { results.updated.push(...fileUpdates.map((f) => f.id as string)) }))
  }
  for (const note of noteCreates) {
    ops.push(callApp<{ id: string; file: string }>('/note-entities/create', {
      method: 'POST',
      body: JSON.stringify({
        canvasX: note.canvasX,
        canvasY: note.canvasY,
        name: deriveNoteName(note.text as string),
        content: note.text,
        width: note.width ?? 400,
        height: note.height ?? 400,
      }),
    }).then((r) => { results.created.push(r.id) }))
  }

  await Promise.all(ops)
  return results
}

// ---------------------------------------------------------------------------
// Annotations — slim list
// ---------------------------------------------------------------------------

export async function getAnnotationsSlim(args: {
  status?: string
  url?: string
  frame_id?: string
}): Promise<{ annotations: Record<string, unknown>[] }> {
  const params = new URLSearchParams()
  if (typeof args.status === 'string' && args.status) {
    params.set('status', args.status)
  }
  if (typeof args.url === 'string' && args.url.trim().length > 0) {
    params.set('url', args.url.trim())
  }
  if (typeof args.frame_id === 'string' && args.frame_id.trim().length > 0) {
    params.set('frame_id', args.frame_id.trim())
  }
  const query = params.toString()
  const result = await callApp<{ annotations: Record<string, unknown>[] }>(
    `/annotations${query ? `?${query}` : ''}`,
  )

  const stubs = result.annotations.map((ann) => {
    const metadata = ann.metadata as Record<string, unknown> | undefined
    const regionElements = metadata?.regionElements as
      | Array<{ frameId: string; frameName: string; elements: Array<Record<string, unknown>> }>
      | undefined
    const regionComponents = metadata?.regionComponents as
      | Array<{ frameId: string; components: Array<Record<string, unknown>> }>
      | undefined
    const inspectContext = metadata?.inspectContext as Record<string, unknown> | undefined

    // Build slim metadata — keep only frameName and pageUrl.
    const slimMeta: Record<string, unknown> = {}
    if (metadata?.frameName) slimMeta.frameName = metadata.frameName
    if (metadata?.pageUrl) slimMeta.pageUrl = metadata.pageUrl

    // Add unified summary with type discriminator.
    if (ann.kind === 'region_select') {
      const elementCount = regionElements?.reduce((n, g) => n + g.elements.length, 0) ?? 0
      const componentCount = regionComponents?.reduce(
        (n, g) => n + (g.components?.length ?? 0),
        0,
      ) ?? 0
      slimMeta.summary = {
        type: 'region',
        frameCount: regionElements?.length ?? 0,
        elementCount,
        hasScreenshot: !!metadata?.regionScreenshot,
        componentCount,
      }
    } else if (inspectContext) {
      slimMeta.summary = {
        type: 'element',
        tagName: inspectContext.tagName ?? null,
        name: inspectContext.name ?? null,
        cssClasses: inspectContext.cssClasses ?? [],
        textPreview: inspectContext.textPreview ?? null,
      }
    }

    return {
      id: ann.id,
      anchor: ann.anchor,
      author: ann.author,
      text: ann.text,
      kind: ann.kind,
      status: ann.status,
      createdAt: ann.createdAt,
      replies: ann.replies,
      ...(Object.keys(slimMeta).length ? { metadata: slimMeta } : {}),
    }
  })

  return { annotations: stubs }
}

// ---------------------------------------------------------------------------
// Annotations — detail with screenshot
// ---------------------------------------------------------------------------

export async function getAnnotationDetail(args: {
  annotation_id: string
  include_screenshot?: boolean
}): Promise<{
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
  >
}> {
  const ann = await callApp<Record<string, unknown>>(
    `/annotations/${args.annotation_id}`,
  )
  const metadata = ann.metadata as Record<string, unknown> | undefined
  const screenshot = metadata?.regionScreenshot as string | undefined
  const regionElements = metadata?.regionElements as
    | Array<{ frameId: string; frameName: string; elements: Array<Record<string, unknown>> }>
    | undefined
  const regionComponents = metadata?.regionComponents as
    | Array<{ frameId: string; components: Array<Record<string, unknown>> }>
    | undefined
  const inspectContext = metadata?.inspectContext as Record<string, unknown> | undefined
  const includeScreenshot = args.include_screenshot !== false

  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
  > = []

  // Build detail metadata — strip heavy blobs from the text representation.
  const detailMeta: Record<string, unknown> = { ...(metadata ?? {}) }
  delete detailMeta.regionScreenshot
  delete detailMeta.regionElements
  delete detailMeta.regionComponents

  // Strip duplicated anchor fields from inspectContext.
  if (inspectContext) {
    const anchor = ann.anchor as Record<string, unknown> | undefined
    const cleaned = { ...inspectContext }
    // Remove internal-only fields.
    delete cleaned.id
    delete cleaned.nodeId
    delete cleaned.timestamp
    // Remove fields already present in anchor.
    if (anchor?.type === 'element') {
      if (anchor.elementPath) delete cleaned.elementPath
      if (anchor.boundingBox) delete cleaned.boundingBox
    }
    detailMeta.inspectContext = cleaned
  }

  // Include regionComponents only when non-empty.
  const hasComponents = regionComponents?.some((g) => g.components?.length > 0) ?? false
  if (hasComponents) {
    detailMeta.regionComponents = regionComponents
  }

  const annForText = { ...ann, metadata: detailMeta }
  content.push({ type: 'text' as const, text: JSON.stringify(annForText, null, 2) })

  // Format region elements as readable text.
  if (regionElements?.length) {
    let summary = 'Elements in region:'
    for (const group of regionElements) {
      summary += `\n  Frame "${group.frameName}":`
      for (const el of group.elements) {
        const tag = el.tagName ?? '?'
        const classes = Array.isArray(el.cssClasses)
          ? (el.cssClasses as string[]).join('.')
          : ''
        const text = el.textPreview ?? ''
        summary += `\n    - <${tag}>${classes ? '.' + classes : ''} "${text}"`
      }
    }
    content.push({ type: 'text' as const, text: summary })
  }

  // Add screenshot as visible image content block.
  if (includeScreenshot && screenshot) {
    content.push({
      type: 'image' as const,
      data: screenshot,
      mimeType: 'image/png',
    })
  }

  return { content }
}
