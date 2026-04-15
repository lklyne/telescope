/**
 * JSON Canvas color presets and resolution.
 *
 * The JSON Canvas spec defines presets "1"–"6" but leaves the actual
 * RGB values up to each application. We map them to soft, unsaturated
 * pastels that read well on both light and dark canvas backgrounds.
 */

export const CANVAS_COLOR_OPTIONS = [
  { id: '1', label: 'Red', hex: '#e8b4b8' },
  { id: '2', label: 'Orange', hex: '#e8ccb0' },
  { id: '3', label: 'Yellow', hex: '#FFE18E' },
  { id: '4', label: 'Green', hex: '#b8d8c8' },
  { id: '5', label: 'Cyan', hex: '#b0d0d8' },
  { id: '6', label: 'Purple', hex: '#c8b8d8' },
] as const

export const COLOR_PRESETS: Record<string, string> = {
  ...Object.fromEntries(CANVAS_COLOR_OPTIONS.map(({ id, hex }) => [id, hex])),
}

/** Resolve a CanvasColor (preset "1"–"6" or hex string) to a CSS color. */
export function resolveCanvasColor(color: string): string {
  return COLOR_PRESETS[color] ?? color
}
