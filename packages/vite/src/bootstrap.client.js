/**
 * Telescope component-render bootstrap.
 *
 * Runs in the user's Vite dev-server origin, inside an Electron WebContentsView
 * embedded in Telescope. There's no contextBridge here — the bootstrap "phones
 * home" by writing prefixed lines to console.log; the host listens via
 * webContents.on('console-message', ...). See @telescope/vite/types
 * (TelescopeBridgeMessage) for the message shape.
 */

import { createRoot } from 'react-dom/client'
import { createElement } from 'react'

const PREFIX = '__telescope__:'

function bridge(message) {
  try {
    console.log(PREFIX + JSON.stringify(message))
  } catch {
    // Last-resort: stringify failures shouldn't bubble.
  }
}

function readTarget() {
  const node = document.getElementById('telescope-target')
  if (!node || !node.textContent) return null
  try {
    return JSON.parse(node.textContent)
  } catch {
    return null
  }
}

window.addEventListener('error', (event) => {
  bridge({
    kind: 'error',
    message: event.message ?? 'Unknown error',
    stack: event.error?.stack,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  bridge({
    kind: 'error',
    message:
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason ?? 'Unhandled rejection'),
    stack: event.reason instanceof Error ? event.reason.stack : undefined,
  })
})

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () =>
    bridge({ kind: 'hmr', phase: 'beforeUpdate' }),
  )
  import.meta.hot.on('vite:afterUpdate', () =>
    bridge({ kind: 'hmr', phase: 'afterUpdate' }),
  )
  import.meta.hot.on('vite:error', (payload) =>
    bridge({ kind: 'hmr', phase: 'error', detail: payload }),
  )
}

async function mount() {
  const target = readTarget()
  if (!target || typeof target.path !== 'string') {
    bridge({ kind: 'error', message: 'Telescope: missing target path' })
    return
  }
  const exportName = typeof target.exportName === 'string' ? target.exportName : 'default'

  let mod
  try {
    mod = await import(/* @vite-ignore */ '/' + target.path.replace(/^\/+/, ''))
  } catch (err) {
    bridge({
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    return
  }

  const Component =
    exportName === 'default'
      ? mod.default ?? Object.values(mod)[0]
      : mod[exportName]

  if (typeof Component !== 'function') {
    bridge({
      kind: 'error',
      message: `Telescope: export ${exportName} is not a component in ${target.path}`,
    })
    return
  }

  const rootEl = document.getElementById('root')
  if (!rootEl) {
    bridge({ kind: 'error', message: 'Telescope: #root element missing' })
    return
  }
  const root = createRoot(rootEl)
  root.render(createElement(Component))
  bridge({ kind: 'ready', path: target.path })
}

mount()
