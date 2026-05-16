import {
  type CanvasPalette,
  paletteSlots,
  resolveCanvasColor,
  slotForStorage,
} from '../../../shared/canvas-colors'

export function ColorSwatchPicker({
  activeColor,
  isDark,
  allowNone,
  palette,
  onSelectColor,
}: {
  activeColor: string | null | undefined
  isDark: boolean
  allowNone?: boolean
  /** Muted pastels (sticky, shape) vs. punchy hues (text, edge). */
  palette: CanvasPalette
  onSelectColor: (color: string) => void
}) {
  const activeSlot = slotForStorage(activeColor)

  return (
    <div className="flex items-center gap-1.5">
      {allowNone ? (
        <button
          type="button"
          aria-label="No color (default)"
          className={`flex h-5 w-5 items-center justify-center rounded-full border transition-transform hover:scale-105 ${
            !activeColor
              ? isDark
                ? 'border-white/80 bg-zinc-900'
                : 'border-zinc-900/80 bg-white'
              : isDark
                ? 'border-transparent hover:border-zinc-600'
                : 'border-transparent hover:border-zinc-300'
          }`}
          onClick={() => onSelectColor('')}
        >
          <span
            className="block h-3.5 w-3.5 rounded-full"
            style={{ background: '#6b7280' }}
          />
        </button>
      ) : null}
      {paletteSlots(palette).map((slot) => {
        const swatch =
          slot.hex ?? resolveCanvasColor(slot.storage, { role: 'fill', isDark })
        const isActive = activeSlot === slot.id
        return (
          <button
            key={slot.id}
            type="button"
            aria-label={`Set color to ${slot.label}`}
            className={`flex h-5 w-5 items-center justify-center rounded-full border transition-transform hover:scale-105 ${
              isActive
                ? isDark
                  ? 'border-white/80 bg-zinc-900'
                  : 'border-zinc-900/80 bg-white'
                : isDark
                  ? 'border-transparent hover:border-zinc-600'
                  : 'border-transparent hover:border-zinc-300'
            }`}
            onClick={() => onSelectColor(slot.storage)}
          >
            <span
              className="block h-3.5 w-3.5 rounded-full"
              style={{ background: swatch }}
            />
          </button>
        )
      })}
    </div>
  )
}
