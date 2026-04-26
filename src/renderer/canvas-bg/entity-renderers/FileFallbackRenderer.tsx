import type { CanvasSceneFileEntity } from '../../../shared/types'

export function FileFallbackRenderer({
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
      }}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke={isDark ? '#a8a29e' : '#78716c'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span
        style={{
          fontSize: 11,
          color: isDark ? '#a8a29e' : '#78716c',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          wordBreak: 'break-all',
          maxWidth: '100%',
        }}
      >
        {fileName}
      </span>
    </div>
  )
}
