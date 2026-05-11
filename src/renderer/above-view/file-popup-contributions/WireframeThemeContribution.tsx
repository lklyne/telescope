/**
 * WireframeThemeContribution — popup row that lets the user swap a wireframe
 * file's theme. Reads/writes the underlying JSON directly through
 * `api.writeNoteFile` and pings the renderer body via the
 * `wireframe-file-changed` CustomEvent so it picks up the disk change
 * without waiting for a layout broadcast.
 *
 * Migrated out of the legacy `FileChrome` wireframe Popover (ADR 0006 §7).
 */

import { useEffect, useState } from 'react'
import type { CanvasBgElectronAPI, CanvasSceneFileEntity } from '../../../shared/types'
import { WIREFRAME_THEME_OPTIONS } from '../../canvas-bg/wireframe/WireframeRenderer'
import type { WireframeThemeName } from '../../canvas-bg/wireframe/wireframe-types'
import { CanvasItemPopup } from '../CanvasItemPopup'

export function WireframeThemeContribution({
  api,
  isDark,
  entity,
}: {
  api: Pick<CanvasBgElectronAPI, 'writeNoteFile'>
  isDark: boolean
  entity: CanvasSceneFileEntity
}) {
  const [theme, setTheme] = useState<WireframeThemeName>('light')

  useEffect(() => {
    let cancelled = false
    const read = async () => {
      try {
        const res = await fetch(
          entity.file.startsWith('local-file://')
            ? entity.file
            : `local-file://${entity.file}`,
        )
        const wf = JSON.parse(await res.text())
        if (!cancelled) setTheme(wf.theme ?? 'light')
      } catch {
        /* ignore */
      }
    }
    void read()
    return () => {
      cancelled = true
    }
  }, [entity.file])

  const handleChange = async (next: WireframeThemeName) => {
    try {
      const res = await fetch(
        entity.file.startsWith('local-file://')
          ? entity.file
          : `local-file://${entity.file}`,
      )
      const wf = JSON.parse(await res.text())
      wf.theme = next
      await api.writeNoteFile(entity.file, JSON.stringify(wf, null, 2))
      setTheme(next)
      // Body renderer owns its own file-content state; disk write alone
      // doesn't propagate. Ping it.
      window.dispatchEvent(
        new CustomEvent('wireframe-file-changed', { detail: { file: entity.file } }),
      )
    } catch {
      /* ignore */
    }
  }

  return (
    <CanvasItemPopup.Section>
      {WIREFRAME_THEME_OPTIONS.map((t) => (
        <button
          key={t.name}
          type="button"
          onClick={() => handleChange(t.name)}
          title={t.name}
          aria-label={`Set wireframe theme to ${t.name}`}
          aria-pressed={theme === t.name}
          className="flex items-center justify-center"
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              border:
                t.name === theme
                  ? `2px solid ${isDark ? '#60a5fa' : '#3b82f6'}`
                  : `1.5px solid ${isDark ? '#3f3f46' : '#d4d4d8'}`,
              background: t.color,
              display: 'block',
            }}
          />
        </button>
      ))}
    </CanvasItemPopup.Section>
  )
}
