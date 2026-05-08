import { describe, expect, it } from 'vitest'
import {
  shouldFocusSelectedPage,
  type ShouldFocusSelectedPageInputs,
} from '../../src/shared/should-focus-selected-page'

function inputs(
  overrides: Partial<ShouldFocusSelectedPageInputs> = {},
): ShouldFocusSelectedPageInputs {
  return {
    selection: { kind: 'single-entity', entityId: 'f1', entityKind: 'page' },
    interactionKind: 'idle',
    toolMode: 'select',
    commentOverlayActive: false,
    ...overrides,
  }
}

describe('shouldFocusSelectedPage — happy path', () => {
  it('returns the page id when single-selected and idle in select mode', () => {
    expect(shouldFocusSelectedPage(inputs())).toBe('f1')
  })
})

describe('shouldFocusSelectedPage — selection shape', () => {
  it('returns null when nothing is selected', () => {
    expect(shouldFocusSelectedPage(inputs({ selection: { kind: 'none' } }))).toBeNull()
  })

  it('returns null when single-selected entity is not a page', () => {
    expect(
      shouldFocusSelectedPage(
        inputs({
          selection: { kind: 'single-entity', entityId: 't1', entityKind: 'text' },
        }),
      ),
    ).toBeNull()
  })

  it('returns null when a page is part of a multi-selection', () => {
    expect(
      shouldFocusSelectedPage(
        inputs({
          selection: { kind: 'multi-entity', entityIds: ['f1', 'f2'] },
        }),
      ),
    ).toBeNull()
  })
})

describe('shouldFocusSelectedPage — divergence cases (plan §8 Phase A)', () => {
  it('case 1: inline text editor active — interactionKind=editing-text excludes', () => {
    expect(
      shouldFocusSelectedPage(inputs({ interactionKind: 'editing-text' })),
    ).toBeNull()
  })

  it('case 2: toolMode=annotate-draw with a page selected excludes', () => {
    expect(shouldFocusSelectedPage(inputs({ toolMode: 'annotate-draw' }))).toBeNull()
  })

  it('case 3: active drag of the single-selected page excludes', () => {
    expect(
      shouldFocusSelectedPage(inputs({ interactionKind: 'dragging-entities' })),
    ).toBeNull()
  })

  it('case 4: toolMode=inspect with a page selected excludes', () => {
    expect(shouldFocusSelectedPage(inputs({ toolMode: 'inspect' }))).toBeNull()
  })

  it('case 4: toolMode=annotate-comment with a page selected excludes', () => {
    expect(
      shouldFocusSelectedPage(inputs({ toolMode: 'annotate-comment' })),
    ).toBeNull()
  })

  it('case 4 follow-up: comment composer open (commentOverlayActive) excludes even when toolMode is select', () => {
    expect(
      shouldFocusSelectedPage(inputs({ commentOverlayActive: true })),
    ).toBeNull()
  })
})

describe('shouldFocusSelectedPage — interaction modes other than idle exclude', () => {
  for (const interactionKind of [
    'panning',
    'marquee',
    'dragging-entities',
    'resizing-entity',
    'dragging-edge',
    'editing-text',
  ] as const) {
    it(`returns null when interactionKind=${interactionKind}`, () => {
      expect(shouldFocusSelectedPage(inputs({ interactionKind }))).toBeNull()
    })
  }
})

describe('shouldFocusSelectedPage — tool modes other than select exclude', () => {
  for (const toolMode of [
    'inspect',
    'annotate-comment',
    'annotate-draw',
    'annotate-region-select',
  ] as const) {
    it(`returns null when toolMode=${toolMode}`, () => {
      expect(shouldFocusSelectedPage(inputs({ toolMode }))).toBeNull()
    })
  }
})
