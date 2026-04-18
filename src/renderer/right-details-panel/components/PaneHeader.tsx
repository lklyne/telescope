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
    <div className="sticky top-0 z-10 flex h-9 shrink-0 items-center gap-1.5 border-b border-[var(--surface-panel-border)] bg-[var(--surface-panel)] px-3">
      {icon}
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{label}</span>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  )
}
