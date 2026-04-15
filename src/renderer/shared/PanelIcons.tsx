export function CircleCheckIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...props}>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" />
      <path d="M4.5 7.2L6.2 8.8L9.5 5.5" stroke="currentColor" strokeLinecap="round" />
    </svg>
  )
}

export function MoreVerticalIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...props}>
      <circle cx="6" cy="2.5" r="1" fill="currentColor" />
      <circle cx="6" cy="6" r="1" fill="currentColor" />
      <circle cx="6" cy="9.5" r="1" fill="currentColor" />
    </svg>
  )
}

export function TrashIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...props}>
      <path d="M2.5 3.5H9.5" stroke="currentColor" strokeLinecap="round" />
      <path d="M4.5 3.5V2.5H7.5V3.5" stroke="currentColor" strokeLinecap="round" />
      <path d="M4 4.5V8.5" stroke="currentColor" strokeLinecap="round" />
      <path d="M6 4.5V8.5" stroke="currentColor" strokeLinecap="round" />
      <path d="M8 4.5V8.5" stroke="currentColor" strokeLinecap="round" />
      <path d="M3.5 9.5H8.5" stroke="currentColor" strokeLinecap="round" />
    </svg>
  )
}

export function CommentBadgeIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...props}>
      <path
        d="M3 3.5h10v7H8.2L5 13.5v-3H3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function InfoIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...props}>
      <circle cx="6" cy="6" r="5" stroke="currentColor" />
      <path d="M6 5.2V8" stroke="currentColor" strokeLinecap="round" />
      <circle cx="6" cy="3.6" r="0.6" fill="currentColor" />
    </svg>
  )
}
