import type { CursorMotionParams } from '../../shared/types'
import { PlaygroundCanvas } from './PlaygroundCanvas'
import { ControlsPanel } from './ControlsPanel'

export function CursorMotionSection({
  params,
  onChange,
  onReset,
}: {
  params: CursorMotionParams
  onChange: (next: CursorMotionParams) => void
  onReset: () => void
}) {
  return (
    <div className="flex h-full w-full min-w-0">
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <PlaygroundCanvas params={params} />
      </div>
      <div className="w-80 shrink-0 overflow-y-auto border-l border-[var(--surface-popover-border)]">
        <ControlsPanel params={params} onChange={onChange} onReset={onReset} />
      </div>
    </div>
  )
}
