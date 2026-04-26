import type { CanvasSceneFileEntity } from '../../../shared/types'

export function ComponentPlaceholderRenderer({
  entity,
  isDark,
}: {
  entity: CanvasSceneFileEntity
  isDark: boolean
}) {
  const fileName = entity.file.split('/').pop() ?? entity.file
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 16,
        fontFamily: 'system-ui, sans-serif',
        color: isDark ? '#a8a29e' : '#78716c',
        fontSize: 11,
        textAlign: 'center',
      }}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
      <span style={{ wordBreak: 'break-all', maxWidth: '100%' }}>{fileName}</span>
      <span style={{ fontSize: 10, opacity: 0.7 }}>
        Connect a Vite repo to render this component
      </span>
    </div>
  )
}
