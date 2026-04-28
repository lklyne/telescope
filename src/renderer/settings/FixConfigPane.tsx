import { useEffect, useState } from 'react'
import type {
  FixConfig,
  FixModel,
  FixPermissions,
  SettingsElectronAPI,
} from '../../shared/types'

export function FixConfigPane({
  api,
  fixConfig,
}: {
  api: SettingsElectronAPI
  fixConfig: FixConfig
}) {
  const [model, setModel] = useState<FixModel>(fixConfig.model)
  const [permissions, setPermissions] = useState<FixPermissions>(fixConfig.permissions)

  useEffect(() => {
    setModel(fixConfig.model)
    setPermissions(fixConfig.permissions)
  }, [fixConfig.model, fixConfig.permissions])

  const dirty = model !== fixConfig.model || permissions !== fixConfig.permissions

  const selectClass =
    'w-full rounded-[6px] border border-[var(--surface-popover-border)] bg-[var(--surface-input)] px-2 py-[6px] text-[12px]'

  return (
    <section>
      <header className="mb-4 mt-2">
        <h2 className="text-[15px] font-semibold">Fix</h2>
        <p className="mt-1 text-[12px] leading-snug text-[var(--surface-toolbar-foreground)] opacity-70">
          Fix uses Claude Code to read your comments and make changes in linked repositories. Pick a model and permission level.
        </p>
      </header>

      <div className="flex max-w-[420px] flex-col gap-4">
        <div>
          <label className="mb-1 block text-[11px] font-medium">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as FixModel)}
            className={selectClass}
          >
            <option value="opus">Opus</option>
            <option value="sonnet">Sonnet</option>
            <option value="haiku">Haiku</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium">Permissions</label>
          <select
            value={permissions}
            onChange={(e) => setPermissions(e.target.value as FixPermissions)}
            className={selectClass}
          >
            <option value="dangerously">Bypass permissions</option>
            <option value="default">Default (approve each tool)</option>
          </select>
          {permissions === 'dangerously' ? (
            <p className="mt-1 text-[10px] leading-snug text-[var(--surface-toolbar-foreground)] opacity-60">
              Claude will read and write files without asking. Only use this on repos you trust.
            </p>
          ) : null}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={!dirty}
            onClick={() => api.setFixConfig({ model, permissions })}
            className="rounded-[6px] bg-emerald-600 px-4 py-[6px] text-[12px] font-medium text-white shadow-sm enabled:hover:bg-emerald-500 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </section>
  )
}
