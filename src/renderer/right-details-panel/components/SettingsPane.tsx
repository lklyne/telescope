import { Check, Copy } from 'lucide-react'
import type { DevtoolsPanelData } from '../../../shared/types'

export function SettingsPane({
  copiedInstall,
  copyInstallCommand,
  isDark,
  mcpSetup,
  mutedClass,
}: {
  copiedInstall: 'idle' | 'ok' | 'err'
  copyInstallCommand: (command: string) => Promise<void>
  isDark: boolean
  mcpSetup: DevtoolsPanelData['emptyState'] | null
  mutedClass: string
}) {
  return (
    <section className="px-2 pt-1 pb-3">
      {mcpSetup ? (
        <>
          <div className={`text-[11px] leading-5 ${mutedClass}`}>
            <div>Claude Code install:</div>
            <div className="mt-1 flex items-center gap-1 rounded border border-zinc-300/70 bg-zinc-100/70 p-2 dark:border-zinc-700/70 dark:bg-zinc-900/70">
              <code
                className="mcp-inline-command-scroll flex-1 overflow-x-auto whitespace-nowrap text-[10px] text-zinc-800 dark:text-zinc-200"
                title={mcpSetup.installCommand}
              >
                {mcpSetup.installCommand}
              </code>
              <button
                type="button"
                className="shrink-0 rounded border border-zinc-300 p-1 text-zinc-700 hover:bg-zinc-200/60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                aria-label="Copy Claude Code install command"
                title={
                  copiedInstall === 'ok'
                    ? 'Copied'
                    : copiedInstall === 'err'
                      ? 'Copy failed'
                      : 'Copy command'
                }
                onClick={() => {
                  void copyInstallCommand(mcpSetup.installCommand)
                }}
              >
                <span className="relative block size-3" aria-hidden>
                  <Copy
                    size={12}
                    className={`absolute inset-0 transition-opacity duration-200 ${
                      copiedInstall === 'ok' ? 'opacity-0' : 'opacity-100'
                    }`}
                  />
                  <Check
                    size={12}
                    className={`absolute inset-0 transition-opacity duration-200 ${
                      copiedInstall === 'ok' ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                </span>
              </button>
            </div>
            <div className="mt-2">Tools:</div>
            <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto rounded border border-zinc-300/70 bg-zinc-100/70 p-2 text-[10px] leading-4 text-zinc-800 dark:border-zinc-700/70 dark:bg-zinc-900/70 dark:text-zinc-200">
              {mcpSetup.tools.map((toolName) => (
                <li key={toolName}>
                  <code>{toolName}</code>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <div className={`text-[11px] leading-5 ${mutedClass}`}>No settings available yet.</div>
      )}
    </section>
  )
}
