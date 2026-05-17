import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
import {
  initComponentExtensions,
  __resetComponentExtensionsForTests,
  DEFAULT_COMPONENT_EXTENSIONS,
} from '../../src/main/runtime/component-extensions'
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
    dir = mkdtempSync(join(tmpdir(), 'specular-find-repo-'))
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
    __resetComponentExtensionsForTests()
    dir = mkdtempSync(join(tmpdir(), 'specular-component-render-'))
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
    __resetComponentExtensionsForTests()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns null when the file is outside every connected repo', async () => {
    connectRepo('/abs/path/to/repo')
    expect(await componentRenderPlugin.resolveUrl(fileEntity('/elsewhere/x.tsx'))).toBeNull()
  })

  it('spawns vite for the most specific connected repo and returns a __specular URL', async () => {
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
      'http://localhost:5173/__specular?path=src%2FButton.tsx',
    )
  })

  it('resolveUrl works for .svelte files inside a connected repo', async () => {
    connectRepo('/Users/alice/Developer/my-app')
    const promise = componentRenderPlugin.resolveUrl(
      fileEntity('/Users/alice/Developer/my-app/src/Counter.svelte'),
    )
    await Promise.resolve()
    pendingChildren[0].stdout.push('  Local:   http://localhost:5173/\n')
    const url = await promise
    expect(url).toBe('http://localhost:5173/__specular?path=src%2FCounter.svelte')
  })

  it('resolveUrl works for .vue files inside a connected repo', async () => {
    connectRepo('/Users/alice/Developer/my-app')
    const promise = componentRenderPlugin.resolveUrl(
      fileEntity('/Users/alice/Developer/my-app/src/App.vue'),
    )
    await Promise.resolve()
    pendingChildren[0].stdout.push('  Local:   http://localhost:5173/\n')
    const url = await promise
    expect(url).toBe('http://localhost:5173/__specular?path=src%2FApp.vue')
  })

  it('returns null for .svelte files outside every connected repo', async () => {
    connectRepo('/Users/alice/Developer/my-app')
    expect(await componentRenderPlugin.resolveUrl(fileEntity('/elsewhere/Counter.svelte'))).toBeNull()
  })
})

describe('componentRenderPlugin.claims — manifest-driven extensions', () => {
  let dir: string

  beforeEach(() => {
    __resetComponentExtensionsForTests()
    dir = mkdtempSync(join(tmpdir(), 'specular-ext-manifest-'))
  })

  afterEach(() => {
    __resetComponentExtensionsForTests()
    rmSync(dir, { recursive: true, force: true })
  })

  it('claims tsx and jsx by default', () => {
    expect(componentRenderPlugin.claims(fileEntity('/repo/Button.tsx'))).toBe(true)
    expect(componentRenderPlugin.claims(fileEntity('/repo/Input.jsx'))).toBe(true)
  })

  it('claims svelte and vue by default', () => {
    expect(componentRenderPlugin.claims(fileEntity('/repo/Counter.svelte'))).toBe(true)
    expect(componentRenderPlugin.claims(fileEntity('/repo/App.vue'))).toBe(true)
  })

  it('does not claim .ts, .js, .md, or .json files', () => {
    expect(componentRenderPlugin.claims(fileEntity('/repo/utils.ts'))).toBe(false)
    expect(componentRenderPlugin.claims(fileEntity('/repo/index.js'))).toBe(false)
    expect(componentRenderPlugin.claims(fileEntity('/repo/README.md'))).toBe(false)
    expect(componentRenderPlugin.claims(fileEntity('/repo/config.json'))).toBe(false)
  })

  it('seeds a manifest file with defaults on first run', () => {
    initComponentExtensions(dir)
    const manifest = JSON.parse(
      require('node:fs').readFileSync(join(dir, 'component-extensions.json'), 'utf8'),
    )
    expect(manifest.extensions).toEqual(DEFAULT_COMPONENT_EXTENSIONS)
  })

  it('reads custom extensions from the manifest', () => {
    writeFileSync(
      join(dir, 'component-extensions.json'),
      JSON.stringify({ extensions: ['tsx', 'astro'] }),
      'utf8',
    )
    initComponentExtensions(dir)
    expect(componentRenderPlugin.claims(fileEntity('/repo/Page.astro'))).toBe(true)
    expect(componentRenderPlugin.claims(fileEntity('/repo/Counter.svelte'))).toBe(false)
  })

  it('falls back to defaults when the manifest is corrupt', () => {
    writeFileSync(join(dir, 'component-extensions.json'), 'not json', 'utf8')
    initComponentExtensions(dir)
    expect(componentRenderPlugin.claims(fileEntity('/repo/Button.tsx'))).toBe(true)
    expect(componentRenderPlugin.claims(fileEntity('/repo/App.vue'))).toBe(true)
  })

  it('falls back to defaults when the manifest has an invalid shape', () => {
    writeFileSync(join(dir, 'component-extensions.json'), JSON.stringify({ extensions: [] }), 'utf8')
    initComponentExtensions(dir)
    expect(componentRenderPlugin.claims(fileEntity('/repo/Button.tsx'))).toBe(true)
  })
})
