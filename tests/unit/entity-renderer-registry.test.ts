import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetRegistryForTests,
  getInlineTagFor,
  listRegisteredRenderers,
  pickRenderer,
  registerEntityRenderer,
  unregisterEntityRenderer,
  type EntityRendererClaim,
} from '../../src/main/plugins/registry'
import type { PersistedFileEntity } from '../../src/shared/types'

function fileEntity(overrides: Partial<PersistedFileEntity> = {}): PersistedFileEntity {
  return {
    kind: 'file',
    id: 'f1',
    file: 'src/Button.tsx',
    canvasX: 0,
    canvasY: 0,
    width: 320,
    height: 240,
    ...overrides,
  }
}

afterEach(() => {
  __resetRegistryForTests()
})

describe('entity-renderer registry', () => {
  it('returns null when no renderer claims the entity', () => {
    expect(pickRenderer(fileEntity())).toBeNull()
    expect(getInlineTagFor(fileEntity())).toBeNull()
  })

  it('first registered claim that matches wins', () => {
    const first: EntityRendererClaim = {
      id: 'first',
      kind: 'inline',
      inlineTag: 'markdown',
      claims: (e) => /\.md$/i.test(e.file),
    }
    const second: EntityRendererClaim = {
      id: 'second',
      kind: 'inline',
      inlineTag: 'markdown',
      claims: (e) => /\.md$/i.test(e.file),
    }
    registerEntityRenderer(first)
    registerEntityRenderer(second)
    expect(pickRenderer(fileEntity({ file: 'notes.md' }))?.id).toBe('first')
  })

  it('inline plugins surface their tag via getInlineTagFor', () => {
    registerEntityRenderer({
      id: 'md',
      kind: 'inline',
      inlineTag: 'markdown',
      claims: (e) => /\.md$/i.test(e.file),
    })
    expect(getInlineTagFor(fileEntity({ file: 'a.md' }))).toBe('markdown')
  })

  it('wcv-page plugins do not contribute an inline tag', () => {
    registerEntityRenderer({
      id: 'comp',
      kind: 'wcv-page',
      claims: (e) => /\.tsx$/i.test(e.file),
      resolveUrl: () => 'http://example.test',
    })
    const entity = fileEntity({ file: 'Button.tsx' })
    expect(pickRenderer(entity)?.id).toBe('comp')
    expect(getInlineTagFor(entity)).toBeNull()
  })

  it('unregister removes the claim', () => {
    registerEntityRenderer({
      id: 'tmp',
      kind: 'inline',
      inlineTag: 'markdown',
      claims: () => true,
    })
    expect(unregisterEntityRenderer('tmp')).toBe(true)
    expect(pickRenderer(fileEntity())).toBeNull()
    expect(unregisterEntityRenderer('tmp')).toBe(false)
  })

  it('throws when registering a duplicate id', () => {
    const claim: EntityRendererClaim = {
      id: 'dup',
      kind: 'inline',
      inlineTag: 'markdown',
      claims: () => true,
    }
    registerEntityRenderer(claim)
    expect(() => registerEntityRenderer(claim)).toThrow(/already registered/)
  })

  it('listRegisteredRenderers preserves registration order', () => {
    const ids = ['a', 'b', 'c']
    for (const id of ids) {
      registerEntityRenderer({
        id,
        kind: 'inline',
        inlineTag: 'markdown',
        claims: () => false,
      })
    }
    expect(listRegisteredRenderers().map((c) => c.id)).toEqual(ids)
  })
})

describe('built-in component-render plugin', () => {
  it('claims .tsx and .jsx files', async () => {
    const { componentRenderPlugin } = await import(
      '../../src/main/plugins/builtin/component-render'
    )
    expect(componentRenderPlugin.kind).toBe('wcv-page')
    expect(componentRenderPlugin.claims(fileEntity({ file: 'Foo.tsx' }))).toBe(true)
    expect(componentRenderPlugin.claims(fileEntity({ file: 'Foo.jsx' }))).toBe(true)
    expect(componentRenderPlugin.claims(fileEntity({ file: 'Foo.ts' }))).toBe(false)
    expect(componentRenderPlugin.claims(fileEntity({ file: 'a.md' }))).toBe(false)
  })
})
