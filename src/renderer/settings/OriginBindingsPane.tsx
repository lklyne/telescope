import { X } from 'lucide-react'
import type { OriginBindings, SettingsElectronAPI } from '../../shared/types'

export function OriginBindingsPane({
  api,
  bindings,
}: {
  api: SettingsElectronAPI
  bindings: OriginBindings
}) {
  const entries = Object.entries(bindings).sort(([a], [b]) => a.localeCompare(b))

  return (
    <section>
      <header className="mb-4 mt-2">
        <h2 className="text-[15px] font-semibold">Bindings</h2>
        <p className="mt-1 text-[12px] leading-snug text-[var(--surface-toolbar-foreground)] opacity-70">
          Origins linked to local repositories. Telescope uses these for in-place fixes from comments. Add new bindings from the right details panel when viewing a frame.
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="rounded-[8px] border border-dashed border-[var(--surface-popover-border)] px-4 py-6 text-center text-[12px] text-[var(--surface-toolbar-foreground)] opacity-60">
          No origin bindings yet.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map(([origin, binding]) => (
            <li
              key={origin}
              className="flex items-start gap-3 rounded-[8px] border border-[var(--surface-popover-border)] bg-[var(--surface-popover-subtle)] px-3 py-[10px]"
            >
              <div className="flex-1 min-w-0">
                <div className="truncate text-[13px] font-medium">{origin}</div>
                <div className="mt-[2px] truncate font-mono text-[11px] text-[var(--surface-toolbar-foreground)] opacity-70">
                  {binding.repoPath}
                </div>
                {binding.autoFix ? (
                  <div className="mt-[2px] text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                    Auto-fix on
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                aria-label={`Remove binding for ${origin}`}
                onClick={() => api.removeOriginBinding(origin)}
                className="shrink-0 rounded-[4px] p-1 text-[var(--surface-toolbar-foreground)] opacity-60 hover:bg-[var(--surface-popover-border)] hover:opacity-100"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
