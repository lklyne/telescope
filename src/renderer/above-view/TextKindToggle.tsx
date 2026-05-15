// ADR 0013 §3 — leading variant pair on the text popup row. The active
// half reflects the currently-selected entity (or, in tool mode, the
// `add-text` default). Clicking the inactive half either morphs the
// selected entity across kinds (selection mode) or repoints the next-
// creation default to that kind (tool mode).

import { FileText, Type } from 'lucide-react'
import type { TextKind } from '../../shared/tool-defaults'
import { CanvasItemPopup } from './CanvasItemPopup'

export function TextKindToggle({
  isDark,
  active,
  onPick,
}: {
  isDark: boolean
  active: TextKind
  onPick: (kind: TextKind) => void
}) {
  return (
    <CanvasItemPopup.Section>
      <CanvasItemPopup.IconButton
        isDark={isDark}
        active={active === 'short'}
        title="Short text"
        ariaLabel="Short text (plain)"
        onClick={() => onPick('short')}
      >
        <Type size={14} />
      </CanvasItemPopup.IconButton>
      <CanvasItemPopup.IconButton
        isDark={isDark}
        active={active === 'long'}
        title="Long text (markdown)"
        ariaLabel="Long text (markdown document)"
        onClick={() => onPick('long')}
      >
        <FileText size={14} />
      </CanvasItemPopup.IconButton>
    </CanvasItemPopup.Section>
  )
}
