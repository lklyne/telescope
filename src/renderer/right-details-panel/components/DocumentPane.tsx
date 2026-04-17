import { Collapsible } from '@base-ui/react/collapsible'
import { ChevronRight } from 'lucide-react'
import type {
  Annotation,
  DevtoolsPanelData,
  DevtoolsPanelFrameSummary,
  FixProgressEntry,
  OriginBindings,
} from '../../../shared/types'
import { dividerClass, isUnresolved, mutedClass } from '../rightDetailsPanelHelpers'
import { useFocusedAnnotationScroll } from '../useFocusedAnnotationScroll'
import { CommentRow, CommentsPane } from './CommentsPane'
import { PaneHeader } from './PaneHeader'
import { SettingsPane } from './SettingsPane'

export function DocumentPane({
  isDark,
  annotations,
  frames,
  focusedAnnotationId,
  annotateEnabled,
  annotateAvailable,
  originBindings,
  fixInProgress,
  fixProgress,
  mcpSetup,
  mcpConnected,
  copiedInstall,
  copyInstallCommand,
}: {
  isDark: boolean
  annotations: Annotation[]
  frames: DevtoolsPanelFrameSummary[]
  focusedAnnotationId?: string | null
  annotateEnabled: boolean
  annotateAvailable: boolean
  originBindings: OriginBindings
  fixInProgress: Record<string, number>
  fixProgress: Record<string, FixProgressEntry>
  mcpSetup: DevtoolsPanelData['emptyState'] | null
  mcpConnected: boolean
  copiedInstall: 'idle' | 'ok' | 'err'
  copyInstallCommand: (command: string) => Promise<void>
}) {
  const muted = mutedClass(isDark)
  const divider = dividerClass(isDark)

  return (
    <div className="flex h-full flex-col overflow-auto">
      <PaneHeader
        label="Document"
      />

      <Collapsible.Root defaultOpen>
        <Collapsible.Trigger
          className="group flex w-full items-center gap-1.5 px-3 py-2 text-[12px] font-medium"
        >
          Comments
          <ChevronRight size={10} className="transition-all ease-out group-data-[panel-open]:rotate-90" />
        </Collapsible.Trigger>
        <Collapsible.Panel className="[&[hidden]:not([hidden='until-found'])]:hidden">
          <CommentsPane
            isDark={isDark}
            annotations={annotations}
            frames={frames}
            focusedAnnotationId={focusedAnnotationId}
            annotateEnabled={annotateEnabled}
            annotateAvailable={annotateAvailable}
            originBindings={originBindings}
            fixInProgress={fixInProgress}
            fixProgress={fixProgress}
          />
        </Collapsible.Panel>
      </Collapsible.Root>

      <ResolvedPane
        isDark={isDark}
        annotations={annotations}
        focusedAnnotationId={focusedAnnotationId}
        divider={divider}
        fixProgress={fixProgress}
      />

      {mcpSetup ? (
        <Collapsible.Root defaultOpen={false}>
          <Collapsible.Trigger
            className={`group flex w-full items-center gap-1.5 border-t px-3 py-2 text-[12px] font-medium ${divider}`}
          >
            MCP Server
            <ChevronRight size={10} className="transition-all ease-out group-data-[panel-open]:rotate-90" />
            <span className="ml-auto flex items-center gap-1.5 text-xs font-normal text-zinc-700 dark:text-zinc-100">
              <span
                className={`inline-block size-2 rounded-full ${
                  mcpConnected ? 'bg-emerald-400' : 'bg-zinc-500'
                }`}
              />
              {mcpConnected ? 'Connected' : 'Disconnected'}
            </span>
          </Collapsible.Trigger>
          <Collapsible.Panel className="h-[var(--collapsible-panel-height)] overflow-hidden transition-all ease-out data-[ending-style]:h-0 data-[starting-style]:h-0 duration-150 [&[hidden]:not([hidden='until-found'])]:hidden">
            <section className="px-2 pb-2">
              <SettingsPane
                copiedInstall={copiedInstall}
                copyInstallCommand={copyInstallCommand}
                isDark={isDark}
                mcpSetup={mcpSetup}
                mutedClass={muted}
              />
            </section>
          </Collapsible.Panel>
        </Collapsible.Root>
      ) : null}
    </div>
  )
}

function ResolvedPane({
  isDark,
  annotations,
  focusedAnnotationId,
  divider,
  fixProgress,
}: {
  isDark: boolean
  annotations: Annotation[]
  focusedAnnotationId?: string | null
  divider: string
  fixProgress: Record<string, FixProgressEntry>
}) {
  const resolved = annotations.filter((a) => !isUnresolved(a.status))
  if (!resolved.length) return null
  resolved.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))

  const muted = mutedClass(isDark)
  const bubbleClass = isDark ? 'bg-zinc-800/45' : 'bg-zinc-100/85'
  const rowHoverClass = isDark ? 'hover:bg-zinc-700/55' : 'hover:border-zinc-300'
  const focusRowClass = isDark ? 'bg-blue-500/20' : 'bg-blue-500/10'
  const { registerAnnotationElement } = useFocusedAnnotationScroll(
    focusedAnnotationId,
    annotations,
  )

  return (
    <Collapsible.Root defaultOpen={false}>
      <Collapsible.Trigger
        className={`group flex w-full items-center gap-1.5 border-t px-3 py-2 text-[12px] font-medium ${divider}`}
      >
        Resolved ({resolved.length})
        <ChevronRight size={10} className="transition-all ease-out group-data-[panel-open]:rotate-90" />
      </Collapsible.Trigger>
      <Collapsible.Panel className="h-[var(--collapsible-panel-height)] overflow-hidden transition-all ease-out data-[ending-style]:h-0 data-[starting-style]:h-0 duration-150 [&[hidden]:not([hidden='until-found'])]:hidden">
        <section className="space-y-1 px-2 pt-1 pb-3">
          {resolved.map((annotation) => (
            <CommentRow
              key={annotation.id}
              annotation={annotation}
              isDark={isDark}
              mutedClass={muted}
              rowHoverClass={rowHoverClass}
              focusRowClass={focusRowClass}
              focusedAnnotationId={focusedAnnotationId}
              registerAnnotationElement={registerAnnotationElement}
              progress={fixProgress[annotation.id]}
            />
          ))}
        </section>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
