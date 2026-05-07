import { describe, expect, it } from 'vitest'
import { routePointerDoubleClick } from '../../src/shared/canvas-pointer-actions'
import type { HitTarget } from '../../src/shared/hit-test'

function target(payload: HitTarget['payload']): HitTarget {
  return {
    layer: 'body',
    region: { kind: 'rect', rect: { x: 0, y: 0, width: 1, height: 1 } },
    payload,
  }
}

describe('routePointerDoubleClick', () => {
  it('shape body → enter-shape-edit', () => {
    expect(
      routePointerDoubleClick(target({ kind: 'entity-body', entityId: 's1', entityKind: 'shape' })),
    ).toEqual({ kind: 'enter-shape-edit', entityId: 's1' })
  })

  it('text body → request-text-edit', () => {
    expect(
      routePointerDoubleClick(target({ kind: 'entity-body', entityId: 't1', entityKind: 'text' })),
    ).toEqual({ kind: 'request-text-edit', entityId: 't1' })
  })

  it('group body → enter-group', () => {
    expect(
      routePointerDoubleClick(target({ kind: 'entity-body', entityId: 'g1', entityKind: 'group' })),
    ).toEqual({ kind: 'enter-group', groupId: 'g1' })
  })

  it('group chrome → enter-group-rename', () => {
    expect(
      routePointerDoubleClick(target({ kind: 'chrome', entityId: 'g1', entityKind: 'group' })),
    ).toEqual({ kind: 'enter-group-rename', groupId: 'g1' })
  })

  it('frame chrome → noop (chrome owns its own dbl-click)', () => {
    expect(
      routePointerDoubleClick(target({ kind: 'chrome', entityId: 'f1', entityKind: 'frame' })),
    ).toEqual({ kind: 'noop' })
  })

  it('file body → noop', () => {
    expect(
      routePointerDoubleClick(target({ kind: 'entity-body', entityId: 'fi1', entityKind: 'file' })),
    ).toEqual({ kind: 'noop' })
  })

  it('background → noop', () => {
    expect(routePointerDoubleClick(target({ kind: 'background' }))).toEqual({ kind: 'noop' })
  })

  it('frame body → noop (single-click already enters focus)', () => {
    expect(
      routePointerDoubleClick(target({ kind: 'frame-body', entityId: 'f1' })),
    ).toEqual({ kind: 'noop' })
  })
})
