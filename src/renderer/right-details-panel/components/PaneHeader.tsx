import type { ReactNode } from 'react'

export function PaneHeader({
  icon,
  label,
  actions,
}: {
  icon?: ReactNode
  label: string
  actions?: ReactNode
}) {
  return (
    <div className="flex h-9 items-center gap-1.5 border-b border-[var(--surface-panel-border)] px-3">
      {icon}
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{label}</span>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  )
}
