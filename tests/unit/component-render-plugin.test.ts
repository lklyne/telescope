import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import { componentRenderPlugin } from '../../src/main/plugins/builtin/component-render'
import {
  __resetDevServerManagerForTests,
  connectRepo,
  findRepoForPath,
  initDevServerManager,
  shutdownDevServerManager,
} from '../../src/main/runtime/dev-server-manager'
import type { PersistedFileEntity } from '../../src/shared/types'

function fileEntity(file: string): PersistedFileEntity {
  return {
    kind: 'file',
    id: 'fe_test',
    file,
    canvasX: 0,
    canvasY: 0,
    width: 320,
    height: 240,
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

describe('findRepoForPath', () => {
  let dir: string

  beforeEach(() => {
    __resetDevServerManagerForTests()
    dir = mkdtempSync(join(tmpdir(), 'telescope-find-repo-'))
    initDevServerManager({
      userDataDir: dir,
      spawn: () => makeFakeChild() as unknown as ChildProcess,
    })
  })

  afterEach(async () => {
    await shutdownDevServerManager()
    rmSync(dir, { recursive: true, force: true })
  })

  it('prefers the longest matching prefix when nested repos overlap', () => {
    connectRepo('/Users/alice')
    const inner = connectRepo('/Users/alice/Developer/my-app')
    const match = findRepoForPath('/Users/alice/Developer/my-app/src/Button.tsx')
    expect(match?.id).toBe(inner.id)
  })

  it('returns null when the file is outside every connected repo', () => {
    connectRepo('/Users/alice/Developer/my-app')
    expect(findRepoForPath('/elsewhere/file.tsx')).toBeNull()
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

  it('returns null when the file is outside every connected repo', async () => {
    connectRepo('/abs/path/to/repo')
    expect(await componentRenderPlugin.resolveUrl(fileEntity('/elsewhere/x.tsx'))).toBeNull()
  })

  it('spawns vite for the most specific connected repo and returns a __telescope URL', async () => {
    connectRepo('/Users/alice')
    connectRepo('/Users/alice/Developer/my-app')
    const promise = componentRenderPlugin.resolveUrl(
      fileEntity('/Users/alice/Developer/my-app/src/Button.tsx'),
    )

    await Promise.resolve()
    expect(pendingChildren).toHaveLength(1)
    pendingChildren[0].stdout.push('  Local:   http://localhost:5173/\n')

    const url = await promise
    expect(url).toBe(
      'http://localhost:5173/__telescope?path=src%2FButton.tsx',
    )
  })
})
