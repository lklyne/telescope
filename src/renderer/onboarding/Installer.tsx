import {
  createContext,
  useContext,
  type ReactNode,
} from 'react'
import { Checkbox } from '@base-ui/react/checkbox'
import { Check, CircleAlert, Loader2, Minus } from 'lucide-react'
import type {
  OnboardingComponentId,
  OnboardingComponentStatus,
} from '../../shared/types'

export type RowProgress = 'idle' | 'installing' | 'success' | 'error'

export type InstallerRowSnapshot = {
  status: OnboardingComponentStatus
  progress: RowProgress
  selected: boolean
  progressDetail?: string
}

type InstallerContextValue = {
  rows: Record<OnboardingComponentId, InstallerRowSnapshot>
  setSelected: (id: OnboardingComponentId, selected: boolean) => void
}

const InstallerContext = createContext<InstallerContextValue | null>(null)

function useInstaller(): InstallerContextValue {
  const ctx = useContext(InstallerContext)
  if (!ctx) throw new Error('Installer subcomponent used outside <Installer.Root>')
  return ctx
}

function Root({
  rows,
  setSelected,
  children,
}: {
  rows: Record<OnboardingComponentId, InstallerRowSnapshot>
  setSelected: (id: OnboardingComponentId, selected: boolean) => void
  children: ReactNode
}) {
  return (
    <InstallerContext.Provider value={{ rows, setSelected }}>
      <div className="flex flex-col gap-2">{children}</div>
    </InstallerContext.Provider>
  )
}

function rowBaseClass(progress: RowProgress): string {
  const base =
    'flex items-start gap-3 rounded-[8px] border border-[var(--surface-popover-border)] bg-[var(--surface-popover-subtle)] px-4 py-3 text-left'
  if (progress === 'installing') return `${base} opacity-90`
  if (progress === 'success') return `${base} border-emerald-500/40`
  if (progress === 'error') return `${base} border-red-500/50`
  return base
}

function Row({
  id,
  title,
  description,
}: {
  id: OnboardingComponentId
  title: string
  description: string
}) {
  const { rows, setSelected } = useInstaller()
  const snapshot = rows[id]

  return (
    <div className={rowBaseClass(snapshot.progress)}>
      <div className="pt-[2px]">
        <Checkbox.Root
          disabled={snapshot.progress === 'installing'}
          checked={snapshot.selected}
          onCheckedChange={(checked) => setSelected(id, Boolean(checked))}
          className="flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border border-[var(--surface-popover-border)] bg-[var(--surface-input)] data-[checked]:border-transparent data-[checked]:bg-emerald-500 data-[disabled]:opacity-50"
        >
          <Checkbox.Indicator className="text-white">
            <Check size={12} strokeWidth={3} />
          </Checkbox.Indicator>
        </Checkbox.Root>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-medium">{title}</span>
          <StatusBadge snapshot={snapshot} />
        </div>
        <p className="mt-1 text-[12px] leading-snug text-[var(--surface-toolbar-foreground)] opacity-70">
          {description}
        </p>
        <RowDetail snapshot={snapshot} />
      </div>
    </div>
  )
}

function StatusBadge({ snapshot }: { snapshot: InstallerRowSnapshot }) {
  if (snapshot.progress === 'installing') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--surface-toolbar-foreground)] opacity-80">
        <Loader2 size={12} className="animate-spin" />
        Installing…
      </span>
    )
  }
  if (snapshot.progress === 'success' || snapshot.status.kind === 'installed') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <Check size={12} strokeWidth={3} />
        Installed
      </span>
    )
  }
  if (snapshot.progress === 'error' || snapshot.status.kind === 'blocked') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400">
        <CircleAlert size={12} />
        {snapshot.progress === 'error' ? 'Failed' : 'Blocked'}
      </span>
    )
  }
  if (snapshot.status.kind === 'outdated') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
        Update available
      </span>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--surface-toolbar-foreground)] opacity-50">
      <Minus size={12} />
      Not installed
    </span>
  )
}

function RowDetail({ snapshot }: { snapshot: InstallerRowSnapshot }) {
  const text =
    snapshot.progress === 'error' || snapshot.progress === 'success'
      ? snapshot.progressDetail
      : snapshot.status.kind === 'installed' ||
          snapshot.status.kind === 'outdated' ||
          snapshot.status.kind === 'blocked'
        ? snapshot.status.detail
        : undefined
  if (!text) return null
  const cls =
    snapshot.progress === 'error' || snapshot.status.kind === 'blocked'
      ? 'mt-1 text-[11px] text-red-600 dark:text-red-400'
      : 'mt-1 text-[11px] text-[var(--surface-toolbar-foreground)] opacity-60'
  return <p className={cls}>{text}</p>
}

export const Installer = { Root, Row }
