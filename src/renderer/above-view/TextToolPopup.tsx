// ADR 0008 §1/§5 — add-text tool popup; writes to per-style tool defaults.
// ADR 0013 §3 — for the plain-text variant, the leading row is a short/long
// toggle that picks whether `add-text` stamps a text entity or a markdown
// file entity for the next creation.

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
import { TextKindToggle } from './TextKindToggle'

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
  const textKind = layout.toolDefaults['add-text'].textKind
  return (
    <CanvasItemPopup.ViewportAnchor layout={layout} open offset={8}>
      <CanvasItemPopup.Frame isDark={isDark}>
        {style === 'plain' ? (
          <TextKindToggle
            isDark={isDark}
            active={textKind}
            onPick={(kind) =>
              api.setToolDefault({
                scope: 'add-text',
                key: 'textKind',
                value: kind,
              })
            }
          />
        ) : null}
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
