import { CANVAS_COLOR_OPTIONS, resolveCanvasColor } from '../../../shared/canvas-colors'

export function ColorSwatchPicker({
  activeColor,
  isDark,
  allowNone,
  onSelectColor,
}: {
  activeColor: string | null | undefined
  isDark: boolean
  allowNone?: boolean
  onSelectColor: (color: string) => void
}) {
  const resolvedActive = activeColor ? resolveCanvasColor(activeColor) : null

  return (
    <div className="flex items-center gap-1.5">
      {allowNone ? (
        <button
          type="button"
          aria-label="No color (default)"
          className={`flex h-5 w-5 items-center justify-center rounded-full border transition-transform hover:scale-105 ${
            !resolvedActive
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
      {CANVAS_COLOR_OPTIONS.map((option) => {
        const resolved = resolveCanvasColor(option.id)
        const isActive = resolvedActive === resolved
        return (
          <button
            key={option.id}
            type="button"
            aria-label={`Set color to ${option.label}`}
            className={`flex h-5 w-5 items-center justify-center rounded-full border transition-transform hover:scale-105 ${
              isActive
                ? isDark
                  ? 'border-white/80 bg-zinc-900'
                  : 'border-zinc-900/80 bg-white'
                : isDark
                  ? 'border-transparent hover:border-zinc-600'
                  : 'border-transparent hover:border-zinc-300'
            }`}
            onClick={() => onSelectColor(option.id)}
          >
            <span
              className="block h-3.5 w-3.5 rounded-full"
              style={{ background: resolved }}
            />
          </button>
        )
      })}
    </div>
  )
}
