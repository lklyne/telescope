/**
 * specular-host.ts — Specular component-render host route for Vite.
 *
 * HOW TO USE
 * ----------
 * 1. Copy this file into your project (e.g. `specular-host.ts` at the repo root).
 * 2. Add one import and one line to your `vite.config`:
 *
 *    import specularHost from './specular-host'
 *    export default defineConfig({ plugins: [specularHost(), yourOtherPlugins()] })
 *
 * 3. Your project must already have the framework's Vite plugin installed:
 *    - React:  @vitejs/plugin-react (or plugin-react-swc)
 *    - Svelte: @sveltejs/vite-plugin-svelte
 *    - Vue:    @vitejs/plugin-vue
 *
 * This plugin registers `GET /__specular?path=<repo-relative-path>` and
 * returns an HTML host document that dynamically imports the component module,
 * picks a framework-specific mount shim based on the file extension, and mounts
 * the module's default export. HMR re-mounts the component on hot update without
 * a full page reload. Compile errors surface through Vite's existing overlay;
 * runtime mount errors are caught and displayed in-frame.
 *
 * CONTRACT
 * --------
 * The `/__specular?path=` route shape is part of Specular's stable API surface
 * and must not change without a corresponding update to the app.
 *
 * FRAMEWORKS SUPPORTED
 * --------------------
 * - React  (.tsx, .jsx) — requires react-dom/client
 * - Svelte (.svelte)    — Svelte 5 mount() or Svelte 4 new Component()
 * - Vue    (.vue)       — requires vue
 *
 * Mount shims are lazily imported so a project missing a framework's runtime
 * never loads that shim.
 */

import type { Plugin, ViteDevServer } from 'vite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function hostHtml(componentPath: string): string {
  const ext = componentPath.split('.').pop()?.toLowerCase() ?? ''

  // language=HTML
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100%; }
    #specular-error {
      position: fixed; inset: 0; display: none;
      background: #1a0010; color: #ff6b9d;
      font: 13px/1.5 ui-monospace, monospace;
      padding: 24px; white-space: pre-wrap; overflow: auto;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="specular-error"></div>
  <script type="module">
    const path = ${JSON.stringify(componentPath)}
    const ext = ${JSON.stringify(ext)}

    function showError(err) {
      const el = document.getElementById('specular-error')
      el.style.display = 'block'
      el.textContent = String(err?.stack ?? err)
    }

    async function mountReact(Component, root) {
      const { createRoot } = await import('react-dom/client')
      const { createElement } = await import('react')
      const reactRoot = createRoot(root)
      reactRoot.render(createElement(Component))
      return () => reactRoot.unmount()
    }

    async function mountSvelte(Component, root) {
      // Svelte 5: mount(Component, { target })
      // Svelte 4: new Component({ target })
      if (typeof Component.mount === 'function') {
        const { mount, unmount } = await import('svelte')
        const instance = mount(Component, { target: root })
        return () => unmount(instance)
      }
      const instance = new Component({ target: root })
      return () => instance.$destroy()
    }

    async function mountVue(Component, root) {
      const { createApp } = await import('vue')
      const app = createApp(Component)
      app.mount(root)
      return () => app.unmount()
    }

    let unmountCurrent = null

    async function mount() {
      const root = document.getElementById('root')
      if (unmountCurrent) {
        try { unmountCurrent() } catch {}
        unmountCurrent = null
        root.innerHTML = ''
      }

      try {
        const mod = await import(/* @vite-ignore */ path)
        const Component = mod.default
        if (!Component) throw new Error('Module has no default export: ' + path)

        if (ext === 'tsx' || ext === 'jsx') {
          unmountCurrent = await mountReact(Component, root)
        } else if (ext === 'svelte') {
          unmountCurrent = await mountSvelte(Component, root)
        } else if (ext === 'vue') {
          unmountCurrent = await mountVue(Component, root)
        } else {
          throw new Error('Unsupported extension: .' + ext)
        }

        document.getElementById('specular-error').style.display = 'none'
      } catch (err) {
        showError(err)
      }
    }

    mount()

    if (import.meta.hot) {
      import.meta.hot.accept(/* @vite-ignore */ path, (newMod) => {
        if (newMod) mount()
      })
    }
  </script>
</body>
</html>`
}

export default function specularHost(): Plugin {
  let server: ViteDevServer | undefined

  return {
    name: 'specular-host',
    apply: 'serve',

    configureServer(s) {
      server = s

      s.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/__specular')) return next()

        const qs = new URL(url, 'http://localhost').searchParams
        const path = qs.get('path')
        if (!path) {
          res.statusCode = 400
          res.end('Missing ?path= parameter')
          return
        }

        const html = hostHtml(`/${path}`)
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.statusCode = 200
        res.end(html)
      })
    },
  }
}
