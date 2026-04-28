import { GitBranch, Sparkles, Wrench } from 'lucide-react'
import type { ComponentType } from 'react'

export type SettingsSection = 'skills' | 'fix' | 'bindings'

const ITEMS: { id: SettingsSection; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'skills', label: 'Skills', icon: Sparkles },
  { id: 'fix', label: 'Fix', icon: Wrench },
  { id: 'bindings', label: 'Bindings', icon: GitBranch },
]

export function Sidebar({
  active,
  onChange,
}: {
  active: SettingsSection
  onChange: (next: SettingsSection) => void
}) {
  return (
    <nav className="w-[180px] shrink-0 border-r border-[var(--surface-popover-border)] bg-[var(--surface-panel)] px-2 pt-2 pb-3">
      <ul className="flex flex-col gap-[2px]">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = active === item.id
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onChange(item.id)}
                className={`flex w-full items-center gap-2 rounded-[6px] px-2 py-[6px] text-left text-[13px] ${
                  isActive
                    ? 'bg-[var(--surface-popover-subtle)] text-[var(--surface-toolbar-foreground)]'
                    : 'text-[var(--surface-toolbar-foreground)] opacity-70 hover:opacity-100'
                }`}
              >
                <Icon size={14} />
                <span>{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
