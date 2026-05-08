/**
 * @specular/vite — Vite plugin that lets Specular render a single React
 * component from your repo as a live page on its canvas.
 *
 * Usage:
 *   // vite.config.ts
 *   import specular from '@specular/vite'
 *   export default { plugins: [specular()] }
 *
 * After this plugin is registered, `GET /__specular?path=src/Button.tsx`
 * serves an HTML shell that mounts the named component using the user's
 * own React + Vite HMR pipeline. Errors and HMR phases are forwarded to
 * Specular via prefixed console lines.
 */

import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Plugin, ViteDevServer } from 'vite'
import type { SpecularPluginOptions } from './types'

export type { SpecularPluginOptions, SpecularBridgeMessage } from './types'

const VIRTUAL_BOOTSTRAP_ID = 'virtual:@specular/vite/bootstrap'
const RESOLVED_BOOTSTRAP_ID = '\0' + VIRTUAL_BOOTSTRAP_ID
const BOOTSTRAP_URL = '/@id/__x00__' + VIRTUAL_BOOTSTRAP_ID

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BOOTSTRAP_SOURCE_PATH = join(__dirname, 'bootstrap.client.js')

function readBootstrapSource(): string {
  return readFileSync(BOOTSTRAP_SOURCE_PATH, 'utf8')
}

function isPathInsideRoot(targetPath: string, root: string): boolean {
  const rel = relative(root, targetPath)
  return Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function buildShell(repoRelativePath: string, exportName: string): string {
  const target = JSON.stringify({ path: repoRelativePath, exportName })
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Specular · ${escapeHtml(repoRelativePath)}</title>
    <style>
      html, body, #root { margin: 0; padding: 0; height: 100%; min-height: 100%; background: transparent; }
      body { font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="application/json" id="specular-target">${target}</script>
    <script type="module" src="${BOOTSTRAP_URL}"></script>
  </body>
</html>
`
}

function matchesAllow(repoRelativePath: string, allow?: string[]): boolean {
  if (!allow || allow.length === 0) return true
  // Tiny glob: '**/*.tsx', '*.tsx', or exact paths. Vite's micromatch is
  // intentionally not pulled in to keep the plugin's surface small.
  for (const pattern of allow) {
    if (pattern === repoRelativePath) return true
    if (pattern === '**/*' || pattern === '*') return true
    if (pattern.startsWith('**/')) {
      const suffix = pattern.slice(2)
      if (repoRelativePath.endsWith(suffix.replace(/^\//, ''))) return true
    }
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2)
      if (repoRelativePath.startsWith(prefix + '/') &&
          !repoRelativePath.slice(prefix.length + 1).includes('/')) {
        return true
      }
    }
  }
  return false
}

export default function specular(options: SpecularPluginOptions = {}): Plugin {
  return {
    name: '@specular/vite',
    enforce: 'pre',

    resolveId(id) {
      if (id === VIRTUAL_BOOTSTRAP_ID) return RESOLVED_BOOTSTRAP_ID
      return null
    },

    load(id) {
      if (id !== RESOLVED_BOOTSTRAP_ID) return null
      return readBootstrapSource()
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__specular', (req, res, next) => {
        if (req.method !== 'GET') {
          next()
          return
        }
        const url = new URL(req.url ?? '/', 'http://x')
        const path = url.searchParams.get('path')
        const exportName = url.searchParams.get('export') ?? 'default'

        if (!path) {
          res.statusCode = 400
          res.end('Specular: missing ?path=')
          return
        }
        if (!matchesAllow(path, options.allow)) {
          res.statusCode = 403
          res.end('Specular: path not in allow list')
          return
        }

        const root = server.config.root
        const absolute = normalize(resolve(root, path))
        if (!isPathInsideRoot(absolute, root)) {
          res.statusCode = 403
          res.end('Specular: path escapes repo root')
          return
        }

        // Pass the shell HTML through Vite's transformIndexHtml so other
        // plugins (notably @vitejs/plugin-react) can inject their preambles.
        // Without this, plugin-react throws "can't detect preamble" when the
        // user's component module loads, because the @react-refresh runtime
        // never gets a chance to register itself on window.
        server
          .transformIndexHtml(req.url ?? '/__specular', buildShell(path, exportName))
          .then((html) => {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.setHeader('Cache-Control', 'no-store')
            res.end(html)
          })
          .catch(next)
      })
    },
  }
}

// Convenience: expose the bootstrap source URL so tests / docs can find it.
export const SPECULAR_BOOTSTRAP_PATH = pathToFileURL(BOOTSTRAP_SOURCE_PATH).href
