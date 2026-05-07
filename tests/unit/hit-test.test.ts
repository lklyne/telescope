import { describe, expect, it } from 'vitest'
import { hitTest, type HitInputs } from '../../src/shared/hit-test'
import type {
  CanvasSceneEntity,
  CanvasSceneFrameEntity,
  CanvasSceneTextEntity,
  CanvasSceneGroupEntity,
} from '../../src/shared/types'

// --- Fixtures ---

function frame(overrides: Partial<CanvasSceneFrameEntity> & { id: string }): CanvasSceneFrameEntity {
  const screenX = overrides.screenX ?? 200
  const screenY = overrides.screenY ?? 200
  const screenWidth = overrides.screenWidth ?? 400
  const screenHeight = overrides.screenHeight ?? 300
  return {
    kind: 'frame',
    id: overrides.id,
    label: overrides.label ?? 'frame',
    url: overrides.url ?? 'https://example.com',
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
    isCustomSize: false,
    browserSizeMode: 'fill',
    canvasX: 0,
    canvasY: 0,
    width: screenWidth,
    height: screenHeight,
    presetIndex: 0,
    linked: false,
    screenX,
    screenY,
    screenWidth,
    screenHeight,
    ...overrides,
  }
}

function text(id: string, screenX: number, screenY: number, w = 100, h = 40): CanvasSceneTextEntity {
  return {
    kind: 'text',
    id,
    text: 'hello',
    color: '#000',
    canvasX: 0,
    canvasY: 0,
    width: w,
    height: h,
    screenX,
    screenY,
    screenWidth: w,
    screenHeight: h,
  }
}

function group(id: string, screenX: number, screenY: number, w = 600, h = 500): CanvasSceneGroupEntity {
  return {
    kind: 'group',
    id,
    label: 'g',
    canvasX: 0,
    canvasY: 0,
    width: w,
    height: h,
    screenX,
    screenY,
    screenWidth: w,
    screenHeight: h,
    groupKind: 'manual',
    layoutMode: 'freeform',
    managedLayout: false,
    entityIds: [],
  }
}

function inputs(entities: CanvasSceneEntity[], selectedEntityIds: string[] = []): HitInputs {
  return { entities, edges: [], selectedEntityIds, zoom: 1 }
}

// --- Collision class tests ---

describe('hit-test — issue #41 anchor near chrome', () => {
  // Frame at screen (200,200), 400×300. Chrome strip is 36px above the frame
  // body, occupying y ∈ [164, 200). The top anchor's hit rect sits 4px
  // above the frame top, height 24px → y ∈ [172, 196). Heavy overlap with
  // chrome y ∈ [164, 200). The bug: anchor wins. The fix: chrome wins.
  const f = frame({ id: 'f1', screenX: 200, screenY: 200 })

  it('chrome wins over top anchor when frame is selected', () => {
    const result = hitTest(inputs([f], ['f1']), { x: 400, y: 185 })
    expect(result.layer).toBe('chrome')
    expect(result.payload).toMatchObject({ kind: 'chrome', entityId: 'f1' })
  })

  it('an anchor click clear of the chrome still hits the anchor', () => {
    // Right-side anchor: x ∈ [604, 628], y ∈ [338, 362]. Well clear of chrome.
    const result = hitTest(inputs([f], ['f1']), { x: 615, y: 350 })
    expect(result.layer).toBe('anchors')
    expect(result.payload).toMatchObject({ kind: 'anchor', side: 'right' })
  })
})

describe('hit-test — resize handles vs body', () => {
  // Frame selected, resize handle at NE corner = (600, 200). Click on the
  // corner should resize, not enter focus.
  const f = frame({ id: 'f1', screenX: 200, screenY: 200 })

  it('resize handle wins over frame body at the corner', () => {
    const result = hitTest(inputs([f], ['f1']), { x: 600, y: 200 })
    expect(result.layer).toBe('resize-handles')
    expect(result.payload).toMatchObject({ kind: 'resize-handle', handle: 'ne' })
  })

  it('clicking deep in the body without selection enters focus', () => {
    const result = hitTest(inputs([f], []), { x: 400, y: 350 })
    expect(result.layer).toBe('body')
    expect(result.payload).toMatchObject({ kind: 'frame-body', entityId: 'f1' })
  })
})

describe('hit-test — body kind dispatches', () => {
  it('frame body returns frame-body intent (focus)', () => {
    const f = frame({ id: 'f1' })
    const result = hitTest(inputs([f]), { x: 400, y: 350 })
    expect(result.payload).toEqual({ kind: 'frame-body', entityId: 'f1' })
  })

  it('text body returns entity-body intent (select)', () => {
    const t = text('t1', 200, 200)
    const result = hitTest(inputs([t]), { x: 250, y: 220 })
    expect(result.payload).toEqual({ kind: 'entity-body', entityId: 't1', entityKind: 'text' })
  })
})

describe('hit-test — group containment', () => {
  // Group spans (100,100) → (700,600). Text inside at (300,300), 100×40.
  // Click inside the text → text body. Click in the group but not in the
  // text → group body.
  const g = group('g1', 100, 100, 600, 500)
  const t = text('t1', 300, 300)

  it('clicking on a member entity selects the member, not the group', () => {
    const result = hitTest(inputs([g, t]), { x: 350, y: 320 })
    expect(result.payload).toMatchObject({ kind: 'entity-body', entityId: 't1' })
  })

  it('clicking inside the group but outside its members selects the group', () => {
    const result = hitTest(inputs([g, t]), { x: 600, y: 550 })
    expect(result.payload).toMatchObject({ kind: 'entity-body', entityId: 'g1', entityKind: 'group' })
  })
})

describe('hit-test — background fallback', () => {
  it('returns background when no entity is hit', () => {
    const result = hitTest(inputs([frame({ id: 'f1' })]), { x: 10, y: 10 })
    expect(result.payload).toEqual({ kind: 'background' })
    expect(result.layer).toBe('background')
  })
})

describe('hit-test — chrome only on chrome-bearing entities', () => {
  it('text entities have no chrome strip', () => {
    const t = text('t1', 200, 200, 100, 40)
    // 36px above text top: y ∈ [164, 200). No chrome should be present.
    const result = hitTest(inputs([t]), { x: 250, y: 180 })
    expect(result.payload).toEqual({ kind: 'background' })
  })
})

describe('hit-test — body z-order (front-to-back)', () => {
  // entityOrder semantics: array order is back-to-front (paint order — the
  // last item paints on top, matching JSON Canvas v1.0). The hit-test must
  // walk the body layer front-to-back so a sticky painted over a frame
  // resolves to the sticky, not the frame body underneath.
  //
  // Frame body at (200,200), 400×300. Sticky at (300,300), 100×40.
  // The sticky is fully inside the frame.

  it('sticky declared front (after frame in entities) wins over frame body', () => {
    const f = frame({ id: 'f1', screenX: 200, screenY: 200 })
    const t = text('t1', 300, 300)
    // Frame first (back), text after (front).
    const result = hitTest(inputs([f, t]), { x: 320, y: 320 })
    expect(result.layer).toBe('body')
    expect(result.payload).toEqual({
      kind: 'entity-body',
      entityId: 't1',
      entityKind: 'text',
    })
  })

  it('reverse z-order (sticky behind frame) returns frame-body', () => {
    const f = frame({ id: 'f1', screenX: 200, screenY: 200 })
    const t = text('t1', 300, 300)
    // Text first (back), frame after (front).
    const result = hitTest(inputs([t, f]), { x: 320, y: 320 })
    expect(result.layer).toBe('body')
    expect(result.payload).toEqual({ kind: 'frame-body', entityId: 'f1' })
  })

  it('two non-group entities — last in entities wins (front)', () => {
    // Two stacked text entities both covering the click point.
    const t1 = text('t1', 200, 200, 200, 200)
    const t2 = text('t2', 200, 200, 200, 200)
    // t2 declared after t1 → front.
    const result = hitTest(inputs([t1, t2]), { x: 300, y: 300 })
    expect(result.payload).toEqual({
      kind: 'entity-body',
      entityId: 't2',
      entityKind: 'text',
    })
    // Reversed declaration order swaps which wins.
    const reversed = hitTest(inputs([t2, t1]), { x: 300, y: 300 })
    expect(reversed.payload).toEqual({
      kind: 'entity-body',
      entityId: 't1',
      entityKind: 'text',
    })
  })

  it('group containment still wins regardless of declared order', () => {
    // Even if the group is declared LAST (front-most by paint order), a
    // member entity inside the group must hit first — groups are containers,
    // their hit-test runs after non-group bodies.
    const g = group('g1', 100, 100, 600, 500)
    const t = text('t1', 300, 300)
    // Group declared after text → would be "front" by paint order, but
    // groups sit at the bottom of the hit-test priority within the body
    // layer.
    const result = hitTest(inputs([t, g]), { x: 350, y: 320 })
    expect(result.payload).toMatchObject({ kind: 'entity-body', entityId: 't1' })
  })
})
