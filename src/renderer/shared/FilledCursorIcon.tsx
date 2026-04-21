export function FilledCursorIcon({
  color,
  size = 16,
}: {
  color: string
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      stroke="rgba(255,255,255,0.9)"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
    >
      <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />
    </svg>
  )
}
