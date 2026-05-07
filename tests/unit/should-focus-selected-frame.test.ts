import { describe, expect, it } from 'vitest'
import {
  shouldFocusSelectedFrame,
  type ShouldFocusSelectedFrameInputs,
} from '../../src/shared/should-focus-selected-frame'

function inputs(
  overrides: Partial<ShouldFocusSelectedFrameInputs> = {},
): ShouldFocusSelectedFrameInputs {
  return {
    selection: { kind: 'single-entity', entityId: 'f1', entityKind: 'frame' },
    interactionKind: 'idle',
    toolMode: 'select',
    commentOverlayActive: false,
    ...overrides,
  }
}

describe('shouldFocusSelectedFrame — happy path', () => {
  it('returns the frame id when single-selected and idle in select mode', () => {
    expect(shouldFocusSelectedFrame(inputs())).toBe('f1')
  })
})

describe('shouldFocusSelectedFrame — selection shape', () => {
  it('returns null when nothing is selected', () => {
    expect(shouldFocusSelectedFrame(inputs({ selection: { kind: 'none' } }))).toBeNull()
  })

  it('returns null when single-selected entity is not a frame', () => {
    expect(
      shouldFocusSelectedFrame(
        inputs({
          selection: { kind: 'single-entity', entityId: 't1', entityKind: 'text' },
        }),
      ),
    ).toBeNull()
  })

  it('returns null when a frame is part of a multi-selection', () => {
    expect(
      shouldFocusSelectedFrame(
        inputs({
          selection: { kind: 'multi-entity', entityIds: ['f1', 'f2'] },
        }),
      ),
    ).toBeNull()
  })
})

describe('shouldFocusSelectedFrame — divergence cases (plan §8 Phase A)', () => {
  it('case 1: inline text editor active — interactionKind=editing-text excludes', () => {
    expect(
      shouldFocusSelectedFrame(inputs({ interactionKind: 'editing-text' })),
    ).toBeNull()
  })

  it('case 2: toolMode=annotate-draw with a frame selected excludes', () => {
    expect(shouldFocusSelectedFrame(inputs({ toolMode: 'annotate-draw' }))).toBeNull()
  })

  it('case 3: active drag of the single-selected frame excludes', () => {
    expect(
      shouldFocusSelectedFrame(inputs({ interactionKind: 'dragging-entities' })),
    ).toBeNull()
  })

  it('case 4: toolMode=inspect with a frame selected excludes', () => {
    expect(shouldFocusSelectedFrame(inputs({ toolMode: 'inspect' }))).toBeNull()
  })

  it('case 4: toolMode=annotate-comment with a frame selected excludes', () => {
    expect(
      shouldFocusSelectedFrame(inputs({ toolMode: 'annotate-comment' })),
    ).toBeNull()
  })

  it('case 4 follow-up: comment composer open (commentOverlayActive) excludes even when toolMode is select', () => {
    expect(
      shouldFocusSelectedFrame(inputs({ commentOverlayActive: true })),
    ).toBeNull()
  })
})

describe('shouldFocusSelectedFrame — interaction modes other than idle exclude', () => {
  for (const interactionKind of [
    'panning',
    'marquee',
    'dragging-entities',
    'resizing-entity',
    'dragging-edge',
    'editing-text',
  ] as const) {
    it(`returns null when interactionKind=${interactionKind}`, () => {
      expect(shouldFocusSelectedFrame(inputs({ interactionKind }))).toBeNull()
    })
  }
})

describe('shouldFocusSelectedFrame — tool modes other than select exclude', () => {
  for (const toolMode of [
    'inspect',
    'annotate-comment',
    'annotate-draw',
    'annotate-region-select',
  ] as const) {
    it(`returns null when toolMode=${toolMode}`, () => {
      expect(shouldFocusSelectedFrame(inputs({ toolMode }))).toBeNull()
    })
  }
})
