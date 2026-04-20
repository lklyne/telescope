import { DEFAULT_BREAKPOINT_PRESET_LABELS } from '../shared/constants'
import { callApp } from './shared/app-client'
import { handleBrowse, shellQuote } from './shared/browse-handler'
import { upsertEntities, type UpsertOptions, getAnnotationsSlim, getAnnotationDetail } from './shared/entity-ops'
import { printJson, printText, printError, printContentBlocks } from './cli-output'
import { parseArgs, type ParsedArgs } from './cli-parser'
import { emitActionIntent, emitActionIntentSync } from './cli-presence'

// ---------------------------------------------------------------------------
// Verb handlers
// ---------------------------------------------------------------------------

type VerbHandler = (args: ParsedArgs) => Promise<number>

function frameId(args: ParsedArgs): string | undefined {
  return args.flags.frame ?? args.flags.f ?? undefined
}

// --- Canvas verbs ---

const workspace: VerbHandler = async () => {
  printJson(await callApp('/workspace'))
  return 0
}

const selection: VerbHandler = async () => {
  printJson(await callApp('/selection'))
  return 0
}

const findPlacement: VerbHandler = async (args) => {
  printJson(await callApp('/layout/find-placement', {
    method: 'POST',
    body: JSON.stringify({
      width: Number(args.flags.width) || 800,
      height: Number(args.flags.height) || 600,
      anchor: args.flags.anchor ?? 'selection_or_empty_region',
    }),
  }))
  return 0
}

const breakpoints: VerbHandler = async (args) => {
  const url = args.positional[0]
  if (!url) { printError('usage: telescope breakpoints <url>'); return 1 }
  printJson(await callApp('/tasks/apply', {
    method: 'POST',
    body: JSON.stringify({
      taskKind: 'breakpoint_map',
      input: {
        url,
        presets: args.flags.presets?.split(',') ?? DEFAULT_BREAKPOINT_PRESET_LABELS,
        label: args.flags.label,
      },
      options: {
        anchor: args.flags.anchor ?? 'selection_or_empty_region',
        focus: !args.boolFlags.has('no-focus'),
      },
    }),
  }))
  return 0
}

const upsert: VerbHandler = async (args) => {
  // Read JSON items from stdin or positional
  let items: Array<Record<string, unknown>>
  if (args.boolFlags.has('json')) {
    const input = await readStdin()
    items = JSON.parse(input)
  } else {
    printError('usage: telescope upsert --json < items.json')
    return 1
  }
  const options: UpsertOptions = {}
  if (args.flags.layout) options.layout = args.flags.layout as UpsertOptions['layout']
  if (args.flags.gap) options.gap = Number(args.flags.gap)
  printJson(await upsertEntities(items, options))
  return 0
}

const create: VerbHandler = async (args) => {
  const subverb = args.positional[0]
  if (subverb === 'frame') {
    const url = args.positional[1]
    if (!url) { printError('usage: telescope create frame <url>'); return 1 }
    const item: Record<string, unknown> = { kind: 'frame', url }
    item.presetIndex = args.flags.preset ? Number(args.flags.preset) : 6 // default to Laptop
    if (args.flags.at) {
      const [x, y] = args.flags.at.split(',').map(Number)
      if (!isNaN(x)) item.canvasX = x
      if (!isNaN(y)) item.canvasY = y
    }
    if (args.boolFlags.has('landscape')) item.orientation = 'landscape'
    if (args.boolFlags.has('no-device-frame')) item.showDeviceFrame = false
    // Move-then-act action is emitted server-side in /frames/create once
    // placement is resolved (matters when --at is omitted and canvasX/Y come
    // from /layout/batch-placement rather than the CLI). `--intent` is not
    // threaded through this path yet — re-add via a dedicated endpoint if
    // that becomes needed.
    printJson(await upsertEntities([item]))
    return 0
  }
  if (subverb === 'note') {
    const text = args.positional.slice(1).join(' ')
    if (!text) { printError('usage: telescope create note <text>'); return 1 }
    const item: Record<string, unknown> = { kind: 'text', text }
    let atPoint: { x: number; y: number } | null = null
    if (args.flags.at) {
      const [x, y] = args.flags.at.split(',').map(Number)
      if (!isNaN(x)) item.canvasX = x
      if (!isNaN(y)) item.canvasY = y
      if (!isNaN(x) && !isNaN(y)) atPoint = { x, y }
    }
    await emitActionIntentSync({
      verb: 'create',
      kind: 'canvas',
      entityKind: 'text',
      explicitRect: atPoint
        ? { x: atPoint.x, y: atPoint.y, width: 240, height: 120 }
        : undefined,
      intent: args.flags.intent,
    })
    if (args.flags.color) item.color = args.flags.color
    // --kind text: force text entity even for long content
    // --kind file: force file entity even for short content
    if (args.flags.kind === 'text') item.forceKind = true
    if (args.flags.kind === 'file') {
      // Route directly to file entity by removing kind override protection
      // and ensuring it gets auto-routed regardless of length
      item.kind = 'text'
      item.forceKind = false
      // Force auto-route by setting a flag the grouping loop checks
      item._forceFile = true
    }
    printJson(await upsertEntities([item]))
    return 0
  }
  printError('usage: telescope create <frame|note> ...')
  return 1
}

const update: VerbHandler = async (args) => {
  const id = args.positional[0]
  if (!id) { printError('usage: telescope update <id> [--preset N] [--at x,y] [--text T] [--color C]'); return 1 }
  const kind = kindFromId(id)
  const item: Record<string, unknown> = { kind, id }
  if (args.flags.at) {
    const [x, y] = args.flags.at.split(',').map(Number)
    if (!isNaN(x)) item.canvasX = x
    if (!isNaN(y)) item.canvasY = y
  }
  // Frame-specific flags
  if (args.flags.preset) item.presetIndex = Number(args.flags.preset)
  if (args.boolFlags.has('landscape')) item.orientation = 'landscape'
  if (args.boolFlags.has('portrait')) item.orientation = 'portrait'
  if (args.boolFlags.has('no-device-frame')) item.showDeviceFrame = false
  // Text note flags
  if (args.flags.text) item.text = args.flags.text
  if (args.flags.color) item.color = args.flags.color
  // Move-then-act: cursor flies to the entity being edited before the patch
  // is applied. For long moves the server caps the wait at 300 ms so the
  // agent never stalls.
  await emitActionIntentSync({
    verb: 'update',
    kind: 'canvas',
    entityIds: [id],
    intent: args.flags.intent,
  })
  printJson(await upsertEntities([item]))
  return 0
}

function kindFromId(id: string): 'frame' | 'text' | 'file' | 'group' {
  if (id.startsWith('frame_')) return 'frame'
  if (id.startsWith('text_')) return 'text'
  if (id.startsWith('group_')) return 'group'
  return 'file'
}

const deleteEntities: VerbHandler = async (args) => {
  // Collect target ids first so the cursor can fly over the thing
  // about to be removed" before the entity disappears. For --json input we
  // pull ids out of the parsed items for the same effect.
  let items: Array<{ id: string; kind: string }> = []
  if (args.boolFlags.has('json')) {
    const input = await readStdin()
    const parsed = JSON.parse(input) as Array<{ id: string; kind?: string }>
    items = parsed.map((item) => ({
      ...item,
      kind: item.kind ?? kindFromId(item.id),
    }))
  } else if (args.positional.length > 0) {
    items = args.positional.map((id) => ({ id, kind: kindFromId(id) }))
  } else {
    printError('usage: telescope delete <id> [id...] or telescope delete --json')
    return 1
  }
  await emitActionIntentSync({
    verb: 'delete',
    kind: 'canvas',
    entityIds: items.map((i) => i.id),
    intent: args.flags.intent,
  })
  printJson(await callApp('/entities/delete', {
    method: 'POST',
    body: JSON.stringify({ items }),
  }))
  return 0
}

const target: VerbHandler = async (args) => {
  const arg = args.positional[0]
  if (!arg) {
    printJson(await callApp('/automation/target'))
    return 0
  }
  const frameId = arg === 'clear' ? null : arg
  printJson(
    await callApp('/automation/target', {
      method: 'POST',
      body: JSON.stringify({ frameId }),
    }),
  )
  return 0
}

const focus: VerbHandler = async (args) => {
  if (args.positional.length === 0) { printError('usage: telescope focus <frameId> [frameId...]'); return 1 }
  // Cursor lands on the target frame(s) before the camera pan fires, so the
  // user sees the cursor "choose" the frame the camera is about to focus.
  await emitActionIntentSync({
    verb: 'focus',
    kind: 'canvas',
    entityIds: args.positional,
    intent: args.flags.intent,
  })
  printJson(await callApp('/camera/focus', {
    method: 'POST',
    body: JSON.stringify({ frameIds: args.positional }),
  }))
  return 0
}

const link: VerbHandler = async (args) => {
  if (args.positional.length >= 2) {
    const [fromEntityId, toEntityId] = args.positional
    const edge: Record<string, unknown> = { fromEntityId, toEntityId, kind: 'connection' }
    if (args.flags.label) edge.label = args.flags.label
    printJson(await callApp('/edges/create', {
      method: 'POST',
      body: JSON.stringify({ edges: [edge] }),
    }))
    return 0
  }
  if (args.positional.length === 1 || (args.positional.length === 0 && process.stdin.isTTY)) {
    printError('usage: telescope link <fromId> <toId> [--label <text>]  (or pipe a JSON edges array on stdin)')
    return 1
  }
  const input = await readStdin()
  printJson(await callApp('/edges/create', {
    method: 'POST',
    body: JSON.stringify({ edges: JSON.parse(input) }),
  }))
  return 0
}

const unlink: VerbHandler = async (args) => {
  if (args.positional.length === 0) { printError('usage: telescope unlink <edgeId> [edgeId...]'); return 1 }
  printJson(await callApp('/edges/delete', {
    method: 'POST',
    body: JSON.stringify({ edgeIds: args.positional }),
  }))
  return 0
}

const group: VerbHandler = async (args) => {
  if (args.positional.length === 0) { printError('usage: telescope group <entityId> [entityId...]'); return 1 }
  // Bridge idiom: cursor sweeps across the entities being grouped, commits
  // on the last one. Short circuit to atomic if only one id was passed.
  await emitActionIntentSync({
    verb: 'group',
    kind: 'canvas',
    bridgeFrom: args.positional[0],
    bridgeTo: args.positional[args.positional.length - 1],
    entityIds: args.positional,
    intent: args.flags.intent,
  })
  printJson(await callApp('/groups/create', {
    method: 'POST',
    body: JSON.stringify({
      entityIds: args.positional,
      label: args.flags.label,
    }),
  }))
  return 0
}

const ungroup: VerbHandler = async (args) => {
  const groupId = args.positional[0]
  if (!groupId) { printError('usage: telescope ungroup <groupId>'); return 1 }
  await emitActionIntentSync({
    verb: 'ungroup',
    kind: 'canvas',
    entityIds: [groupId],
    intent: args.flags.intent,
  })
  printJson(await callApp('/groups/ungroup', {
    method: 'POST',
    body: JSON.stringify({ groupId }),
  }))
  return 0
}

// --- Annotation verbs ---

const annotations: VerbHandler = async (args) => {
  const status = args.boolFlags.has('all')
    ? 'all'
    : (args.flags.status ?? 'unresolved')
  const result = await getAnnotationsSlim({
    status,
    url: args.flags.url,
    frame_id: args.flags['frame-id'],
  })
  printJson(result)
  return 0
}

const annotation: VerbHandler = async (args) => {
  const id = args.positional[0]
  if (!id) { printError('usage: telescope annotation <id>'); return 1 }
  const result = await getAnnotationDetail({
    annotation_id: id,
    include_screenshot: !args.boolFlags.has('no-screenshot'),
  })
  printContentBlocks(result.content)
  return 0
}

const annotate: VerbHandler = async (args) => {
  const text = args.positional.join(' ')
  if (!text) { printError('usage: telescope annotate <text>'); return 1 }
  // Construct anchor: frame-specific if --frame-id given, else viewport
  const anchor = args.flags['frame-id']
    ? { type: 'frame', frameId: args.flags['frame-id'] }
    : { type: 'viewport' }
  // Cursor lands on the frame being annotated before the annotation is
  // created. When the annotation is viewport-scoped there's nothing to
  // point at, so the waypoint falls through to the workspace default.
  await emitActionIntentSync({
    verb: 'annotate',
    kind: 'canvas',
    entityIds: args.flags['frame-id'] ? [args.flags['frame-id']] : undefined,
    intent: args.flags.intent,
  })
  printJson(await callApp('/annotations', {
    method: 'POST',
    body: JSON.stringify({
      text,
      kind: args.flags.kind,
      anchor,
      author: 'agent',
    }),
  }))
  return 0
}

const ack: VerbHandler = async (args) => {
  const id = args.positional[0]
  if (!id) { printError('usage: telescope ack <annotation-id>'); return 1 }
  printJson(await callApp(`/annotations/${id}/acknowledge`, { method: 'POST', body: '{}' }))
  return 0
}

const resolve: VerbHandler = async (args) => {
  const id = args.positional[0]
  if (!id) { printError('usage: telescope resolve <annotation-id>'); return 1 }
  printJson(await callApp(`/annotations/${id}/resolve`, { method: 'POST', body: '{}' }))
  return 0
}

const dismiss: VerbHandler = async (args) => {
  const id = args.positional[0]
  if (!id) { printError('usage: telescope dismiss <annotation-id>'); return 1 }
  printJson(await callApp(`/annotations/${id}/dismiss`, {
    method: 'POST',
    body: JSON.stringify({ reason: args.flags.reason }),
  }))
  return 0
}

const reply: VerbHandler = async (args) => {
  const id = args.positional[0]
  const text = args.positional.slice(1).join(' ')
  if (!id || !text) { printError('usage: telescope reply <annotation-id> <text>'); return 1 }
  printJson(await callApp(`/annotations/${id}/reply`, {
    method: 'POST',
    body: JSON.stringify({ author: 'agent', text }),
  }))
  return 0
}

// --- Recording verbs ---

const record: VerbHandler = async (args) => {
  const sub = args.positional[0]
  if (sub === 'start') {
    const fid = args.positional[1] ?? frameId(args)
    if (!fid) { printError('usage: telescope record start <frameId>'); return 1 }
    printJson(await callApp('/recording/start', {
      method: 'POST',
      body: JSON.stringify({
        frameId: fid,
        outputPath: args.flags.output,
        fps: args.flags.fps ? Number(args.flags.fps) : undefined,
        quality: args.flags.quality,
      }),
    }))
    return 0
  }
  if (sub === 'stop') {
    printJson(await callApp('/recording/stop', { method: 'POST' }))
    return 0
  }
  if (sub === 'status') {
    printJson(await callApp('/recording/status'))
    return 0
  }
  if (sub === 'trim') {
    const input = args.positional[1]
    if (!input) { printError('usage: telescope record trim <input-path>'); return 1 }
    printJson(await callApp('/recording/trim', {
      method: 'POST',
      body: JSON.stringify({
        inputPath: input,
        outputPath: args.flags.output,
        minIdleMs: args.flags['min-idle'] ? Number(args.flags['min-idle']) : undefined,
        idleSpeedFactor: args.flags['speed-factor'] ? Number(args.flags['speed-factor']) : undefined,
      }),
    }))
    return 0
  }
  printError('usage: telescope record <start|stop|status|trim>')
  return 1
}

// --- Design system verbs ---

const designSystem: VerbHandler = async () => {
  printJson(await callApp('/design-system'))
  return 0
}

const registerDesignSystem: VerbHandler = async () => {
  const input = await readStdin()
  printJson(await callApp('/design-system/register', {
    method: 'POST',
    body: JSON.stringify({ manifest: JSON.parse(input) }),
  }))
  return 0
}

const componentStates: VerbHandler = async (args) => {
  const component = args.positional[0]
  const url = args.positional[1]
  if (!component || !url) { printError('usage: telescope component-states <component> <url>'); return 1 }
  printJson(await callApp('/tasks/component-states', {
    method: 'POST',
    body: JSON.stringify({
      component,
      url,
      anchor: args.flags.anchor ?? 'selection_or_empty_region',
      focus: !args.boolFlags.has('no-focus'),
      label: args.flags.label,
    }),
  }))
  return 0
}

// --- Browser shortcut verbs ---

function browseCommand(args: ParsedArgs, command: string): Promise<number> {
  return browseRaw(args, command)
}

async function browseRaw(args: ParsedArgs, command: string): Promise<number> {
  const result = await handleBrowse({ frame_id: frameId(args), command })
  printContentBlocks(result.content)
  return 0
}

const BROWSE_VERBS = new Set([
  'snapshot', 'click', 'fill', 'type', 'select', 'hover',
  'screenshot', 'scroll', 'wait',
  'get', 'console', 'errors', 'query-elements',
  'navigate', 'back', 'forward', 'reload',
])

function printBrowseVerbHelp(verb: string): void {
  printText(`usage: telescope ${verb} [-f <frameId>] [options]\n`)
  printText(`Forwards to agent-browser. For the full option list run:\n  agent-browser ${verb} --help`)
}

const snapshot: VerbHandler = async (args) => {
  // Reconstruct agent-browser snapshot command from flags
  let cmd = 'snapshot'
  if (args.boolFlags.has('i')) cmd += ' -i'
  if (args.flags.s) cmd += ` -s "${args.flags.s}"`
  if (args.flags.selector) cmd += ` -s "${args.flags.selector}"`
  if (args.flags.depth) cmd += ` -d ${args.flags.depth}`
  if (args.flags.format) cmd += ` --format ${args.flags.format}`
  return browseCommand(args, cmd)
}

const click: VerbHandler = async (args) => {
  const ref = args.positional[0]
  if (!ref) { printError('usage: telescope click <ref>'); return 1 }
  return browseCommand(args, `click ${ref}`)
}

const fill: VerbHandler = async (args) => {
  const ref = args.positional[0]
  const text = args.positional.slice(1).join(' ')
  if (!ref || !text) { printError('usage: telescope fill <ref> <text>'); return 1 }
  return browseCommand(args, `fill ${ref} "${text}"`)
}

const type_: VerbHandler = async (args) => {
  const ref = args.positional[0]
  const text = args.positional.slice(1).join(' ')
  if (!ref || !text) { printError('usage: telescope type <ref> <text>'); return 1 }
  return browseCommand(args, `type ${ref} "${text}"`)
}

const select: VerbHandler = async (args) => {
  const ref = args.positional[0]
  const value = args.positional.slice(1).join(' ')
  if (!ref || !value) { printError('usage: telescope select <ref> <value>'); return 1 }
  return browseCommand(args, `select ${ref} "${value}"`)
}

const screenshot: VerbHandler = async (args) => {
  let cmd = 'screenshot'
  if (args.boolFlags.has('annotate')) cmd += ' --annotate'
  return browseCommand(args, cmd)
}

const scroll: VerbHandler = async (args) => {
  const direction = args.positional[0] ?? 'down'
  const amount = args.positional[1]
  let cmd = `scroll ${direction}`
  if (amount) cmd += ` ${amount}`
  return browseCommand(args, cmd)
}

const wait: VerbHandler = async (args) => {
  let cmd = 'wait'
  if (args.flags.load) cmd += ` --load ${args.flags.load}`
  if (args.positional[0]) cmd += ` ${args.positional[0]}`
  if (args.flags.timeout) cmd += ` --timeout ${args.flags.timeout}`
  return browseCommand(args, cmd)
}

// --- Passthrough: unknown verbs go to agent-browser ---

/** Flags consumed by telescope that must not leak into agent-browser commands. */
const TELESCOPE_ONLY_FLAGS = new Set(['--frame', '-f'])

function stripTelescopeFlags(argv: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < argv.length; i++) {
    if (TELESCOPE_ONLY_FLAGS.has(argv[i])) { i++; continue } // skip flag + value
    out.push(argv[i])
  }
  return out
}

const browsePassthrough: VerbHandler = async (args) => {
  const command = [args.verb, ...stripTelescopeFlags(args.rest).map(shellQuote)].join(' ')
  return browseRaw(args, command)
}

// ---------------------------------------------------------------------------
// Verb dispatch map
// ---------------------------------------------------------------------------

const VERBS: Record<string, VerbHandler> = {
  workspace,
  selection,
  'find-placement': findPlacement,
  breakpoints,
  upsert,
  create,
  update,
  delete: deleteEntities,
  focus,
  target,
  link,
  unlink,
  group,
  ungroup,
  annotations,
  annotation,
  annotate,
  ack,
  resolve,
  dismiss,
  reply,
  record,
  'design-system': designSystem,
  'register-design-system': registerDesignSystem,
  'component-states': componentStates,
  // Browser shortcut verbs
  snapshot,
  click,
  fill,
  type: type_,
  select,
  screenshot,
  scroll,
  wait,
  // Read-only browser verbs
  get: browsePassthrough,
  console: browsePassthrough,
  errors: browsePassthrough,
  'query-elements': browsePassthrough,
}

export async function dispatch(argv: string[]): Promise<number> {
  const args = parseArgs(argv)
  if (!args.verb || args.verb === '--help' || args.verb === '-h') {
    printText('usage: telescope <verb> [args...] [--flag value]')
    printText('')
    printText('Canvas: workspace, create, update, delete, focus, group, ungroup')
    printText('Automation: target <frameId|clear> — set active frame for browse verbs')
    printText('Browse: snapshot, click, fill, type, select, screenshot, scroll, wait')
    printText('Annotations: annotations, annotation, annotate, ack, resolve, dismiss, reply')
    printText('Recording: record <start|stop|status|trim>')
    printText('Other: breakpoints, upsert, link, unlink, find-placement')
    printText('')
    printText('Unknown verbs are passed to agent-browser as raw commands.')
    return 0
  }
  // The action intent is emitted by each individual handler so it can
  // resolve real entity rects and use the sync "move-then-act" variant where
  // it makes sense. For verbs that don't opt in (workspace/selection/scan
  // reads, passthroughs, design-system etc.) we fire a fallback
  // fire-and-forget intent here so the cursor still gets a label update
  // without a specific rect to move toward.
  const HANDLER_OWNS_ACTION = new Set([
    'create',
    'update',
    'upsert',
    'delete',
    'focus',
    'group',
    'ungroup',
    'annotate',
    // Browse verbs build their AgentAction from handleBrowse with richer context.
    'snapshot',
    'click',
    'fill',
    'type',
    'select',
    'hover',
    'screenshot',
    'scroll',
    'wait',
    'get',
    'console',
    'errors',
    'query-elements',
    'navigate',
    'back',
    'forward',
    'reload',
  ])
  // Browse verbs forward --help/-h to agent-browser's own help, without
  // requiring a frame. Must run before the handler's positional-arg checks
  // (which would otherwise short-circuit with "usage: ...missing ref").
  if (BROWSE_VERBS.has(args.verb) && (args.boolFlags.has('help') || args.boolFlags.has('h'))) {
    printBrowseVerbHelp(args.verb)
    return 0
  }
  if (!HANDLER_OWNS_ACTION.has(args.verb)) {
    emitActionIntent({
      verb: args.verb,
      kind: 'canvas',
      intent: args.flags.intent ?? undefined,
    })
  } else if (args.flags.intent !== undefined) {
    // Handler-owned actions still need the --intent propagated so the
    // session-scoped subtitle is set before the handler's own emit.
    emitActionIntent({ verb: args.verb, intent: args.flags.intent })
  }
  const handler = VERBS[args.verb] ?? browsePassthrough
  return handler(args)
}

// ---------------------------------------------------------------------------
// Stdin helper
// ---------------------------------------------------------------------------

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    process.stdin.on('error', reject)
  })
}
