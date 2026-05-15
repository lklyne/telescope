// ADR 0008 §1/§5 — add-text tool popup; writes to per-style tool defaults.

import {
  CANVAS_COLOR_SLOTS,
  resolveCanvasColor,
  slotForStorage,
} from '../../shared/canvas-colors'
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
  const currentRaw =
    style === 'sticky'
      ? layout.toolDefaults['add-sticky'].color
      : layout.toolDefaults['add-text'].color
  const activeSlot = slotForStorage(currentRaw)
  // Sticky bodies are surface-fill role; plain text glyphs are ink role.
  const swatchRole = style === 'sticky' ? 'fill' : 'ink'
  return (
    <CanvasItemPopup.ViewportAnchor layout={layout} open offset={8}>
      <CanvasItemPopup.Frame isDark={isDark}>
        <CanvasItemPopup.Section>
          {CANVAS_COLOR_SLOTS.map((slot) => {
            const swatch =
              slot.hex ?? resolveCanvasColor(slot.storage, { role: swatchRole, isDark })
            return (
              <CanvasItemPopup.ColorSwatch
                key={slot.id}
                isDark={isDark}
                active={activeSlot === slot.id}
                color={swatch}
                ariaLabel={`Set default ${style} text color to ${slot.label}`}
                onClick={() => {
                  const patch: ToolDefaultPatch =
                    style === 'sticky'
                      ? { scope: 'add-sticky', key: 'color', value: slot.storage }
                      : { scope: 'add-text', key: 'color', value: slot.storage }
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
