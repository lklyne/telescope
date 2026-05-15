/**
 * JSON Canvas color presets and resolution.
 *
 * Two-axis model (ADR 0013 §1):
 *
 *  - **Slot**: one of eight named choices the popups expose
 *    (`neutral` · `purple` · `blue` · `cyan` · `green` · `yellow` · `orange` · `red`).
 *  - **Role**: how the color is used at render time —
 *    `'fill'` (sticky/shape backgrounds) or `'ink'` (pen strokes, plain text glyphs).
 *
 * The seven hue slots resolve to fixed pastel hexes regardless of theme/role.
 * The `neutral` slot is theme- and role-aware: it picks light/dark fills for
 * surfaces and contrasting dark/light inks for marks. On disk, neutral is
 * stored as `specular.colorRole: 'neutral'` (with `color: '1'` as a fallback
 * for cross-tool readers); hue slots are stored as 6-char hex.
 *
 * Legacy `"1"`–`"6"` presets (the original JSON Canvas spec values) keep
 * resolving to their original red/orange/yellow/green/cyan/purple hexes —
 * existing canvases continue to render as before.
 */

export type CanvasColorRole = 'fill' | 'ink'

export type CanvasColorSlot =
  | 'neutral'
  | 'purple'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'

export interface CanvasColorSlotInfo {
  id: CanvasColorSlot
  label: string
  /** Hex for hue slots; `null` for the theme-aware neutral. */
  hex: string | null
  /** What goes into `entity.color` when the user picks this slot. */
  storage: string
}

/** Storage sentinel for the theme/role-aware neutral. */
export const NEUTRAL_STORAGE = 'neutral'

const NEUTRAL_FILL_LIGHT = '#fdf8f5'
const NEUTRAL_FILL_DARK = '#3a3836'
const NEUTRAL_INK_LIGHT = '#1c1917'
const NEUTRAL_INK_DARK = '#e7e5e4'

/**
 * Eight-slot palette in canonical popup order (ADR 0013 §1).
 *
 * Hex values intentionally match the previous `CANVAS_COLOR_OPTIONS` pastels
 * for the hues that already existed (purple/cyan/green/yellow/orange/red);
 * blue is new; neutral is theme/role-resolved at render time.
 */
export const CANVAS_COLOR_SLOTS: ReadonlyArray<CanvasColorSlotInfo> = [
  { id: 'neutral', label: 'Neutral', hex: null, storage: NEUTRAL_STORAGE },
  { id: 'purple', label: 'Purple', hex: '#c8b8d8', storage: '#c8b8d8' },
  { id: 'blue', label: 'Blue', hex: '#b0c4d8', storage: '#b0c4d8' },
  { id: 'cyan', label: 'Cyan', hex: '#b0d0d8', storage: '#b0d0d8' },
  { id: 'green', label: 'Green', hex: '#b8d8c8', storage: '#b8d8c8' },
  { id: 'yellow', label: 'Yellow', hex: '#FFE18E', storage: '#FFE18E' },
  { id: 'orange', label: 'Orange', hex: '#e8ccb0', storage: '#e8ccb0' },
  { id: 'red', label: 'Red', hex: '#e8b4b8', storage: '#e8b4b8' },
] as const

/** Legacy JSON Canvas presets (`"1"`–`"6"`) → hue slot. */
const LEGACY_PRESET_TO_SLOT: Record<string, CanvasColorSlot> = {
  '1': 'red',
  '2': 'orange',
  '3': 'yellow',
  '4': 'green',
  '5': 'cyan',
  '6': 'purple',
}

/** Legacy preset → hex. Kept so old canvases render unchanged. */
export const COLOR_PRESETS: Record<string, string> = Object.fromEntries(
  Object.entries(LEGACY_PRESET_TO_SLOT).map(([preset, slot]) => [
    preset,
    CANVAS_COLOR_SLOTS.find((s) => s.id === slot)!.hex!,
  ]),
)

const SLOT_BY_HEX: Record<string, CanvasColorSlot> = Object.fromEntries(
  CANVAS_COLOR_SLOTS.filter((s) => s.hex).map((s) => [
    s.hex!.toLowerCase(),
    s.id,
  ]),
)

/**
 * Resolve a stored canvas color value to a CSS color string.
 *
 * Accepts: the `'neutral'` sentinel, a `#RRGGBB` hex, or a legacy
 * `"1"`–`"6"` preset id. For neutral, pass `opts.role` and `opts.isDark`
 * to pick the right RGB; without opts, neutral falls back to the light
 * fill value (a sane default for callers that haven't been theme-wired).
 */
export function resolveCanvasColor(
  color: string,
  opts?: { role?: CanvasColorRole; isDark?: boolean },
): string {
  if (color === NEUTRAL_STORAGE) {
    const role = opts?.role ?? 'fill'
    const isDark = opts?.isDark ?? false
    return resolveNeutral(role, isDark)
  }
  return COLOR_PRESETS[color] ?? color
}

function resolveNeutral(role: CanvasColorRole, isDark: boolean): string {
  if (role === 'ink') return isDark ? NEUTRAL_INK_DARK : NEUTRAL_INK_LIGHT
  return isDark ? NEUTRAL_FILL_DARK : NEUTRAL_FILL_LIGHT
}

/**
 * The slot that a stored color matches, or `null` when it doesn't line up
 * with any palette slot (custom hex or absent).
 *
 * Used by popups to highlight the active swatch.
 */
export function slotForStorage(color: string | null | undefined): CanvasColorSlot | null {
  if (!color) return null
  if (color === NEUTRAL_STORAGE) return 'neutral'
  if (LEGACY_PRESET_TO_SLOT[color]) return LEGACY_PRESET_TO_SLOT[color]
  if (color.startsWith('#')) {
    const hit = SLOT_BY_HEX[color.toLowerCase()]
    return hit ?? null
  }
  return null
}

/** Apply an alpha to a #RRGGBB hex color; passes other forms through. */
export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return color
}

/** Lighten a #RRGGBB hex by interpolating toward white. amount=0 leaves it; amount=1 returns white. */
export function lightenHex(color: string, amount: number): string {
  if (!color.startsWith('#') || color.length !== 7) return color
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  const lr = Math.round(r + (255 - r) * amount)
  const lg = Math.round(g + (255 - g) * amount)
  const lb = Math.round(b + (255 - b) * amount)
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${hex(lr)}${hex(lg)}${hex(lb)}`
}

// --- Backwards-compat aliases ---------------------------------------------
// Several call sites still reference `CANVAS_COLOR_OPTIONS`. Keep the export
// pointing at the new slot list so existing iteration order (now eight) keeps
// working without touching callers we don't need to change.
export const CANVAS_COLOR_OPTIONS = CANVAS_COLOR_SLOTS
