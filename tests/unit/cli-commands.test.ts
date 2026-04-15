import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures these are available when vi.mock factories run
// ---------------------------------------------------------------------------

const {
  mockCallApp,
  mockHandleBrowse,
  mockUpsertEntities,
  mockGetAnnotationsSlim,
  mockGetAnnotationDetail,
  mockPrintJson,
  mockPrintText,
  mockPrintError,
  mockPrintContentBlocks,
} = vi.hoisted(() => ({
  mockCallApp: vi.fn().mockResolvedValue({ ok: true }),
  mockHandleBrowse: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
  mockUpsertEntities: vi.fn().mockResolvedValue({ created: ['id-1'], updated: [] }),
  mockGetAnnotationsSlim: vi.fn().mockResolvedValue({ annotations: [] }),
  mockGetAnnotationDetail: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'detail' }] }),
  mockPrintJson: vi.fn(),
  mockPrintText: vi.fn(),
  mockPrintError: vi.fn(),
  mockPrintContentBlocks: vi.fn(),
}))

vi.mock('../../src/main/shared/app-client', () => ({
  callApp: mockCallApp,
  sessionId: 'test-session',
  getClientName: () => 'test-client',
  setClientName: vi.fn(),
  notifySessionState: vi.fn(),
  startHeartbeat: vi.fn(),
  stopHeartbeat: vi.fn(),
}))

vi.mock('../../src/main/shared/browse-handler', () => ({
  handleBrowse: mockHandleBrowse,
}))

vi.mock('../../src/main/shared/entity-ops', () => ({
  upsertEntities: mockUpsertEntities,
  getAnnotationsSlim: mockGetAnnotationsSlim,
  getAnnotationDetail: mockGetAnnotationDetail,
}))

vi.mock('../../src/main/cli-output', () => ({
  printJson: mockPrintJson,
  printText: mockPrintText,
  printError: mockPrintError,
  printContentBlocks: mockPrintContentBlocks,
}))

import { dispatch } from '../../src/main/cli-commands'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Canvas verb dispatch
// ---------------------------------------------------------------------------

describe('canvas verbs', () => {
  it('workspace calls GET /workspace', async () => {
    await dispatch(['workspace'])
    expect(mockCallApp).toHaveBeenCalledWith('/workspace')
    expect(mockPrintJson).toHaveBeenCalled()
  })

  it('selection calls GET /selection', async () => {
    await dispatch(['selection'])
    expect(mockCallApp).toHaveBeenCalledWith('/selection')
  })

  it('focus calls POST /camera/focus with frameIds', async () => {
    await dispatch(['focus', 'frame-1', 'frame-2'])
    expect(mockCallApp).toHaveBeenCalledWith('/camera/focus', {
      method: 'POST',
      body: JSON.stringify({ frameIds: ['frame-1', 'frame-2'] }),
    })
  })

  it('focus returns 1 with no args', async () => {
    const code = await dispatch(['focus'])
    expect(code).toBe(1)
    expect(mockPrintError).toHaveBeenCalled()
  })

  it('delete calls POST /entities/delete with ids and inferred kinds', async () => {
    await dispatch(['delete', 'frame_a', 'text_b', 'group_c'])
    expect(mockCallApp).toHaveBeenCalledWith('/entities/delete', {
      method: 'POST',
      body: JSON.stringify({ items: [
        { id: 'frame_a', kind: 'frame' },
        { id: 'text_b', kind: 'text' },
        { id: 'group_c', kind: 'group' },
      ] }),
    })
  })

  it('group calls POST /groups/create', async () => {
    await dispatch(['group', 'e1', 'e2', '--label', 'My Group'])
    expect(mockCallApp).toHaveBeenCalledWith('/groups/create', {
      method: 'POST',
      body: JSON.stringify({ entityIds: ['e1', 'e2'], label: 'My Group' }),
    })
  })

  it('ungroup calls POST /groups/ungroup', async () => {
    await dispatch(['ungroup', 'g1'])
    expect(mockCallApp).toHaveBeenCalledWith('/groups/ungroup', {
      method: 'POST',
      body: JSON.stringify({ groupId: 'g1' }),
    })
  })

  it('unlink calls POST /edges/delete', async () => {
    await dispatch(['unlink', 'edge-1', 'edge-2'])
    expect(mockCallApp).toHaveBeenCalledWith('/edges/delete', {
      method: 'POST',
      body: JSON.stringify({ edgeIds: ['edge-1', 'edge-2'] }),
    })
  })
})

// ---------------------------------------------------------------------------
// Create/update shorthand
// ---------------------------------------------------------------------------

describe('create verb', () => {
  it('create frame <url> defaults to preset 6', async () => {
    await dispatch(['create', 'frame', 'https://example.com'])
    expect(mockUpsertEntities).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'frame', url: 'https://example.com', presetIndex: 6 }),
    ])
  })

  it('create frame with --preset and --at skips auto-placement', async () => {
    await dispatch(['create', 'frame', 'https://example.com', '--preset', '7', '--at', '100,200'])
    expect(mockUpsertEntities).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'frame', url: 'https://example.com', presetIndex: 7, canvasX: 100, canvasY: 200 }),
    ])
  })

  it('create frame with --landscape auto-places', async () => {
    await dispatch(['create', 'frame', 'https://example.com', '--landscape'])
    expect(mockUpsertEntities).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'frame', url: 'https://example.com', orientation: 'landscape', presetIndex: 6 }),
    ])
  })

  it('create note calls upsertEntities with text item', async () => {
    await dispatch(['create', 'note', 'hello', 'world'])
    expect(mockUpsertEntities).toHaveBeenCalledWith([
      { kind: 'text', text: 'hello world' },
    ])
  })

  it('create with no subverb returns 1', async () => {
    const code = await dispatch(['create'])
    expect(code).toBe(1)
    expect(mockPrintError).toHaveBeenCalled()
  })

  it('create frame with no url returns 1', async () => {
    const code = await dispatch(['create', 'frame'])
    expect(code).toBe(1)
  })
})

describe('update verb', () => {
  it('update frame_ id with --preset infers kind from id', async () => {
    await dispatch(['update', 'frame_abc', '--preset', '3'])
    expect(mockUpsertEntities).toHaveBeenCalledWith([
      { kind: 'frame', id: 'frame_abc', presetIndex: 3 },
    ])
  })

  it('update with --at coordinates', async () => {
    await dispatch(['update', 'frame_abc', '--at', '800,400'])
    expect(mockUpsertEntities).toHaveBeenCalledWith([
      { kind: 'frame', id: 'frame_abc', canvasX: 800, canvasY: 400 },
    ])
  })

  it('update text_ id infers kind text and supports --color', async () => {
    await dispatch(['update', 'text_abc', '--color', 'red'])
    expect(mockUpsertEntities).toHaveBeenCalledWith([
      { kind: 'text', id: 'text_abc', color: 'red' },
    ])
  })

  it('update text_ id supports --text', async () => {
    await dispatch(['update', 'text_abc', '--text', 'new content'])
    expect(mockUpsertEntities).toHaveBeenCalledWith([
      { kind: 'text', id: 'text_abc', text: 'new content' },
    ])
  })

  it('update group_ id infers kind group', async () => {
    await dispatch(['update', 'group_abc', '--at', '100,200'])
    expect(mockUpsertEntities).toHaveBeenCalledWith([
      { kind: 'group', id: 'group_abc', canvasX: 100, canvasY: 200 },
    ])
  })

  it('update with no id returns 1', async () => {
    const code = await dispatch(['update'])
    expect(code).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Browser shortcut verbs
// ---------------------------------------------------------------------------

describe('browser shortcut verbs', () => {
  it('snapshot -i reconstructs command', async () => {
    await dispatch(['snapshot', '-i'])
    expect(mockHandleBrowse).toHaveBeenCalledWith({
      frame_id: undefined,
      command: 'snapshot -i',
    })
  })

  it('snapshot with --frame passes frame_id', async () => {
    await dispatch(['snapshot', '-i', '--frame', 'f-123'])
    expect(mockHandleBrowse).toHaveBeenCalledWith({
      frame_id: 'f-123',
      command: 'snapshot -i',
    })
  })

  it('snapshot with -s selector', async () => {
    await dispatch(['snapshot', '-i', '-s', '#main'])
    expect(mockHandleBrowse).toHaveBeenCalledWith({
      frame_id: undefined,
      command: 'snapshot -i -s "#main"',
    })
  })

  it('click @e5 reconstructs command', async () => {
    await dispatch(['click', '@e5'])
    expect(mockHandleBrowse).toHaveBeenCalledWith({
      frame_id: undefined,
      command: 'click @e5',
    })
  })

  it('fill @e3 hello world reconstructs command', async () => {
    await dispatch(['fill', '@e3', 'hello', 'world'])
    expect(mockHandleBrowse).toHaveBeenCalledWith({
      frame_id: undefined,
      command: 'fill @e3 "hello world"',
    })
  })

  it('type @e3 text reconstructs command', async () => {
    await dispatch(['type', '@e3', 'some text'])
    expect(mockHandleBrowse).toHaveBeenCalledWith({
      frame_id: undefined,
      command: 'type @e3 "some text"',
    })
  })

  it('select @e3 value reconstructs command', async () => {
    await dispatch(['select', '@e3', 'option-a'])
    expect(mockHandleBrowse).toHaveBeenCalledWith({
      frame_id: undefined,
      command: 'select @e3 "option-a"',
    })
  })

  it('screenshot reconstructs command', async () => {
    await dispatch(['screenshot'])
    expect(mockHandleBrowse).toHaveBeenCalledWith({
      frame_id: undefined,
      command: 'screenshot',
    })
  })

  it('screenshot --annotate reconstructs command', async () => {
    await dispatch(['screenshot', '--annotate'])
    expect(mockHandleBrowse).toHaveBeenCalledWith({
      frame_id: undefined,
      command: 'screenshot --annotate',
    })
  })

  it('scroll down reconstructs command', async () => {
    await dispatch(['scroll', 'down'])
    expect(mockHandleBrowse).toHaveBeenCalledWith({
      frame_id: undefined,
      command: 'scroll down',
    })
  })

  it('click with no ref returns 1', async () => {
    const code = await dispatch(['click'])
    expect(code).toBe(1)
  })

  it('fill with no text returns 1', async () => {
    const code = await dispatch(['fill', '@e3'])
    expect(code).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Passthrough verbs
// ---------------------------------------------------------------------------

describe('passthrough verbs', () => {
  it('unknown verb falls through to browsePassthrough', async () => {
    await dispatch(['eval', 'document.title'])
    expect(mockHandleBrowse).toHaveBeenCalledWith({
      frame_id: undefined,
      command: 'eval document.title',
    })
  })

  it('explicitly listed passthrough verbs route to handleBrowse', async () => {
    await dispatch(['get', 'url'])
    expect(mockHandleBrowse).toHaveBeenCalledWith({
      frame_id: undefined,
      command: 'get url',
    })
  })

  it('passthrough with --frame strips flag from command', async () => {
    await dispatch(['get', 'text', '--frame', 'frame_abc'])
    expect(mockHandleBrowse).toHaveBeenCalledWith({
      frame_id: 'frame_abc',
      command: 'get text',
    })
  })

  it('passthrough with -f strips flag from command', async () => {
    await dispatch(['console', '-f', 'frame_abc'])
    expect(mockHandleBrowse).toHaveBeenCalledWith({
      frame_id: 'frame_abc',
      command: 'console',
    })
  })

  it('passthrough preserves agent-browser flags while stripping --frame', async () => {
    await dispatch(['get', 'text', '-s', 'main', '--frame', 'frame_abc'])
    expect(mockHandleBrowse).toHaveBeenCalledWith({
      frame_id: 'frame_abc',
      command: 'get text -s main',
    })
  })
})

// ---------------------------------------------------------------------------
// Annotation verbs
// ---------------------------------------------------------------------------

describe('annotation verbs', () => {
  it('annotations calls getAnnotationsSlim', async () => {
    await dispatch(['annotations', '--status', 'pending'])
    expect(mockGetAnnotationsSlim).toHaveBeenCalledWith({
      status: 'pending',
      url: undefined,
      frame_id: undefined,
    })
  })

  it('annotation <id> calls getAnnotationDetail', async () => {
    await dispatch(['annotation', 'ann-1'])
    expect(mockGetAnnotationDetail).toHaveBeenCalledWith({
      annotation_id: 'ann-1',
      include_screenshot: true,
    })
  })

  it('annotate posts to /annotations with viewport anchor', async () => {
    await dispatch(['annotate', 'Form', 'works', 'correctly'])
    expect(mockCallApp).toHaveBeenCalledWith('/annotations', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Form works correctly',
        kind: undefined,
        anchor: { type: 'viewport' },
        author: 'agent',
      }),
    })
  })

  it('annotate with --frame-id uses frame anchor', async () => {
    await dispatch(['annotate', 'Bug found', '--frame-id', 'frame_abc'])
    expect(mockCallApp).toHaveBeenCalledWith('/annotations', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Bug found',
        kind: undefined,
        anchor: { type: 'frame', frameId: 'frame_abc' },
        author: 'agent',
      }),
    })
  })

  it('ack posts to /annotations/<id>/acknowledge', async () => {
    await dispatch(['ack', 'ann-1'])
    expect(mockCallApp).toHaveBeenCalledWith('/annotations/ann-1/acknowledge', {
      method: 'POST',
      body: '{}',
    })
  })

  it('resolve posts to /annotations/<id>/resolve', async () => {
    await dispatch(['resolve', 'ann-1'])
    expect(mockCallApp).toHaveBeenCalledWith('/annotations/ann-1/resolve', {
      method: 'POST',
      body: '{}',
    })
  })

  it('dismiss posts with reason', async () => {
    await dispatch(['dismiss', 'ann-1', '--reason', 'Not applicable'])
    expect(mockCallApp).toHaveBeenCalledWith('/annotations/ann-1/dismiss', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Not applicable' }),
    })
  })

  it('reply posts text to thread', async () => {
    await dispatch(['reply', 'ann-1', 'I', 'checked', 'this'])
    expect(mockCallApp).toHaveBeenCalledWith('/annotations/ann-1/reply', {
      method: 'POST',
      body: JSON.stringify({ author: 'agent', text: 'I checked this' }),
    })
  })
})

// ---------------------------------------------------------------------------
// Record verb
// ---------------------------------------------------------------------------

describe('record verb', () => {
  it('record start calls /recording/start', async () => {
    await dispatch(['record', 'start', 'frame-1', '--output', '/tmp/video.webm'])
    expect(mockCallApp).toHaveBeenCalledWith('/recording/start', {
      method: 'POST',
      body: JSON.stringify({
        frameId: 'frame-1',
        outputPath: '/tmp/video.webm',
        fps: undefined,
        quality: undefined,
      }),
    })
  })

  it('record stop calls /recording/stop', async () => {
    await dispatch(['record', 'stop'])
    expect(mockCallApp).toHaveBeenCalledWith('/recording/stop', { method: 'POST' })
  })

  it('record status calls GET /recording/status', async () => {
    await dispatch(['record', 'status'])
    expect(mockCallApp).toHaveBeenCalledWith('/recording/status')
  })

  it('record with no subverb returns 1', async () => {
    const code = await dispatch(['record'])
    expect(code).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

describe('help', () => {
  it('--help prints usage and returns 0', async () => {
    const code = await dispatch(['--help'])
    expect(code).toBe(0)
    expect(mockPrintText).toHaveBeenCalled()
  })

  it('empty input prints usage and returns 0', async () => {
    const code = await dispatch([])
    expect(code).toBe(0)
    expect(mockPrintText).toHaveBeenCalled()
  })
})
