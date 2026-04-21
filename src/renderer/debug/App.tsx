import { useCallback, useEffect, useState } from 'react'
import type {
  CursorMotionParams,
  CursorTuningParams,
  DebugBootstrapData,
  DebugElectronAPI,
  PresenceDebugEntry,
} from '../../shared/types'
import { DEFAULT_CURSOR_TUNING } from '../../shared/cursor-tuning'
import { useTheme } from '../shared/hooks/useTheme'
import { CursorMotionSection } from './CursorMotionSection'
import { PresenceSection } from './PresenceSection'

type SectionId = 'cursor-motion' | 'presence'

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: 'cursor-motion', label: 'Cursor motion (legacy)' },
  { id: 'presence', label: 'Presence' },
]

export default function App({
  api,
  initialData,
}: {
  api: DebugElectronAPI
  initialData: DebugBootstrapData
}) {
  useTheme(initialData.theme, api.onThemeChanged)
  const [activeSection, setActiveSection] = useState<SectionId>('presence')
  const [cursorMotion, setCursorMotion] = useState<CursorMotionParams>(
    initialData.cursorMotion,
  )
  const [splineViz, setSplineViz] = useState<boolean>(initialData.cursorSplineViz)
  const [cursorTuning, setCursorTuning] = useState<CursorTuningParams>(
    initialData.cursorTuning,
  )

  useEffect(() => api.onCursorMotionChanged(setCursorMotion), [api])
  useEffect(() => api.onCursorSplineVizChanged(setSplineViz), [api])

  const subscribeTimeline = useCallback(
    (cb: (entry: PresenceDebugEntry) => void) =>
      api.onPresenceTimelineAppend(cb),
    [api],
  )

  const commitCursorMotion = (next: CursorMotionParams) => {
    setCursorMotion(next)
    api.updateCursorMotion(next)
  }

  const commitSplineViz = (next: boolean) => {
    setSplineViz(next)
    api.updateCursorSplineViz(next)
  }

  const commitCursorTuning = (next: CursorTuningParams) => {
    setCursorTuning(next)
    api.updateCursorTuning(next)
  }

  const resetCursorTuning = () => {
    api.resetCursorTuning()
    setCursorTuning(DEFAULT_CURSOR_TUNING)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="titlebar-drag h-[34px] w-full shrink-0" />
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-44 shrink-0 flex-col border-r border-[var(--surface-popover-border)] px-2 py-3">
          <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider opacity-50">
            Debug
          </div>
          {SECTIONS.map((section) => {
            const active = section.id === activeSection
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`rounded px-2 py-1 text-left text-[12px] ${
                  active
                    ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900'
                }`}
              >
                {section.label}
              </button>
            )
          })}
        </nav>
        <main className="flex min-h-0 min-w-0 flex-1">
          {activeSection === 'cursor-motion' ? (
            <CursorMotionSection
              params={cursorMotion}
              onChange={commitCursorMotion}
              onReset={api.resetCursorMotion}
            />
          ) : activeSection === 'presence' ? (
            <PresenceSection
              splineViz={splineViz}
              onSplineVizChange={commitSplineViz}
              tuning={cursorTuning}
              onTuningChange={commitCursorTuning}
              onTuningReset={resetCursorTuning}
              initialTimeline={initialData.presenceTimeline}
              subscribeTimeline={subscribeTimeline}
            />
          ) : null}
        </main>
      </div>
    </div>
  )
}
