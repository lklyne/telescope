import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import { readComponentRenderMetadata } from '../../src/main/plugins/builtin/component-render-metadata'
import { componentRenderPlugin } from '../../src/main/plugins/builtin/component-render'
import {
  __resetDevServerManagerForTests,
  connectRepo,
  initDevServerManager,
  shutdownDevServerManager,
} from '../../src/main/runtime/dev-server-manager'
import type { PersistedFileEntity } from '../../src/shared/types'

function fileEntity(overrides: Partial<PersistedFileEntity> = {}): PersistedFileEntity {
  return {
    kind: 'file',
    id: 'fe_test',
    file: '/repo/src/Button.tsx',
    canvasX: 0,
    canvasY: 0,
    width: 320,
    height: 240,
    ...overrides,
  }
}

interface FakeChild extends EventEmitter {
  stdout: Readable
  stderr: Readable
  kill: (signal?: string) => boolean
  killed: boolean
}

function makeFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild
  child.stdout = new Readable({ read() {} })
  child.stderr = new Readable({ read() {} })
  child.killed = false
  child.kill = () => {
    child.killed = true
    queueMicrotask(() => child.emit('exit', 0, null))
    return true
  }
  return child
}

describe('readComponentRenderMetadata', () => {
  it('returns null when metadata is absent', () => {
    expect(readComponentRenderMetadata(fileEntity())).toBeNull()
  })

  it('returns null when the componentRender key is malformed', () => {
    expect(
      readComponentRenderMetadata(fileEntity({ metadata: { componentRender: 'oops' } })),
    ).toBeNull()
  })

  it('parses a fully populated entry', () => {
    const meta = readComponentRenderMetadata(
      fileEntity({
        metadata: {
          componentRender: { repoId: 'abc123', repoRelativePath: 'src/Button.tsx' },
        },
      }),
    )
    expect(meta).toEqual({ repoId: 'abc123', repoRelativePath: 'src/Button.tsx' })
  })

  it('coerces non-string fields to null', () => {
    const meta = readComponentRenderMetadata(
      fileEntity({
        metadata: {
          componentRender: { repoId: 123, repoRelativePath: null },
        },
      }),
    )
    expect(meta).toEqual({ repoId: null, repoRelativePath: null })
  })
})

describe('componentRenderPlugin.resolveUrl', () => {
  let dir: string
  let pendingChildren: FakeChild[]

  beforeEach(() => {
    __resetDevServerManagerForTests()
    dir = mkdtempSync(join(tmpdir(), 'telescope-component-render-'))
    pendingChildren = []
    initDevServerManager({
      userDataDir: dir,
      spawn: () => {
        const child = makeFakeChild()
        pendingChildren.push(child)
        return child as unknown as ChildProcess
      },
    })
  })

  afterEach(async () => {
    await shutdownDevServerManager()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns null when no metadata is present', async () => {
    expect(await componentRenderPlugin.resolveUrl(fileEntity())).toBeNull()
  })

  it('returns null when metadata names an unknown repo', async () => {
    const url = await componentRenderPlugin.resolveUrl(
      fileEntity({
        metadata: {
          componentRender: { repoId: 'no-such-repo', repoRelativePath: 'x.tsx' },
        },
      }),
    )
    expect(url).toBeNull()
  })

  it('spawns vite and resolves to a __telescope URL once the dev server reports ready', async () => {
    const repo = connectRepo('/abs/path/to/repo')
    const promise = componentRenderPlugin.resolveUrl(
      fileEntity({
        metadata: {
          componentRender: { repoId: repo.id, repoRelativePath: 'src/Button.tsx' },
        },
      }),
    )

    // Wait a microtask for spawn to be invoked, then push the local-url line.
    await Promise.resolve()
    expect(pendingChildren).toHaveLength(1)
    pendingChildren[0].stdout.push('  Local:   http://localhost:5173/\n')

    const url = await promise
    expect(url).toBe(
      'http://localhost:5173/__telescope?path=src%2FButton.tsx',
    )
  })
})
