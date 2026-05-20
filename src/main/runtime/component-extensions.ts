/**
 * Component-render extension manifest.
 *
 * Reads a small JSON file from userData (`component-extensions.json`) that
 * controls which file extensions are claimed by the component-render plugin.
 * Seeded with defaults on first run; a missing or corrupt file falls back
 * silently. Takes effect on the next app launch (re-read at boot).
 *
 * Designed for testability: inject userDataDir via initComponentExtensions().
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MANIFEST_FILENAME = 'component-extensions.json'

export const DEFAULT_COMPONENT_EXTENSIONS = ['tsx', 'jsx', 'svelte', 'vue']

interface ComponentExtensionsManifest {
  extensions: string[]
}

let extensions: string[] = [...DEFAULT_COMPONENT_EXTENSIONS]

function isValidManifest(parsed: unknown): parsed is ComponentExtensionsManifest {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    Array.isArray((parsed as ComponentExtensionsManifest).extensions) &&
    (parsed as ComponentExtensionsManifest).extensions.length > 0 &&
    (parsed as ComponentExtensionsManifest).extensions.every((e) => typeof e === 'string')
  )
}

export function initComponentExtensions(userDataDir: string): void {
  const filePath = join(userDataDir, MANIFEST_FILENAME)

  if (!existsSync(filePath)) {
    const manifest: ComponentExtensionsManifest = { extensions: DEFAULT_COMPONENT_EXTENSIONS }
    try {
      writeFileSync(filePath, JSON.stringify(manifest, null, 2), 'utf8')
    } catch {
      // Non-fatal if userData dir isn't writable yet; defaults still apply.
    }
    extensions = [...DEFAULT_COMPONENT_EXTENSIONS]
    return
  }

  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (isValidManifest(parsed)) {
      extensions = parsed.extensions
    } else {
      extensions = [...DEFAULT_COMPONENT_EXTENSIONS]
    }
  } catch {
    extensions = [...DEFAULT_COMPONENT_EXTENSIONS]
  }
}

/** Returns true when `filePath` matches one of the loaded component extensions. */
export function isComponentFile(filePath: string): boolean {
  const lower = filePath.toLowerCase()
  return extensions.some((ext) => lower.endsWith(`.${ext}`))
}

/** Test-only: reset to defaults. */
export function __resetComponentExtensionsForTests(): void {
  extensions = [...DEFAULT_COMPONENT_EXTENSIONS]
}
