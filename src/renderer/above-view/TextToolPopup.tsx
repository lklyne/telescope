// ADR 0008 §1/§5 — add-text tool popup; writes to per-style tool defaults.

import { CANVAS_COLOR_OPTIONS, resolveCanvasColor } from '../../shared/canvas-colors'
import type {
  CanvasBgElectronAPI,
  LayoutUpdateData,
  TextEntityStyle,
  ToolDefaultPatch,
} from '../../shared/types'
import { CanvasItemPopup } from './CanvasItemPopup'

export function TextToolPopup({
  api,
  isDark,
  layout,
  style,
}: {
  api: Pick<CanvasBgElectronAPI, 'setToolDefault'>
  isDark: boolean
  layout: LayoutUpdateData
  style: TextEntityStyle
}) {
  const key: 'sticky.color' | 'plain.color' =
    style === 'sticky' ? 'sticky.color' : 'plain.color'
  const currentRaw = layout.toolDefaults['add-text'][key]
  const current = currentRaw === null ? null : resolveCanvasColor(currentRaw)
  return (
    <CanvasItemPopup.ViewportAnchor layout={layout} open offset={8}>
      <CanvasItemPopup.Frame isDark={isDark}>
        <CanvasItemPopup.Section>
          {CANVAS_COLOR_OPTIONS.map((option) => {
            const resolved = resolveCanvasColor(option.id)
            const active = current !== null && current === resolved
            return (
              <CanvasItemPopup.ColorSwatch
                key={option.id}
                isDark={isDark}
                active={active}
                color={resolved}
                ariaLabel={`Set default ${style} text color to ${option.label}`}
                onClick={() => {
                  const patch: ToolDefaultPatch =
                    style === 'sticky'
                      ? { scope: 'add-text', key: 'sticky.color', value: option.id }
                      : { scope: 'add-text', key: 'plain.color', value: option.id }
                  api.setToolDefault(patch)
                }}
              />
            )
          })}
        </CanvasItemPopup.Section>
      </CanvasItemPopup.Frame>
    </CanvasItemPopup.ViewportAnchor>
  )
}
