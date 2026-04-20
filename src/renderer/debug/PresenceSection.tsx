/**
 * Presence debug panel — playground on the left, tuning controls on the right.
 *
 * The playground mirrors the director's advance loop locally so the user can
 * retarget the cursor with a click and watch the speed model react to tuning
 * changes in real time. If the playground feels snappy but the real agent
 * cursor feels slow, the problem is somewhere outside the director.
 */

import type {
  CursorTuningParams,
  EasingPreset,
  EasingSpec,
  PresenceDebugEntry,
} from '../../shared/types'
import { PresencePlayground } from './PresencePlayground'
import { PresenceTimelinePanel } from './PresenceTimelinePanel'

const EASING_PRESETS: EasingPreset[] = [
  'linear',
  'easeInOutCubic',
  'easeOutExpo',
  'easeInOutQuart',
  'easeOutBack',
  'easeInOutSine',
]

export function PresenceSection({
  splineViz,
  onSplineVizChange,
  tuning,
  onTuningChange,
  onTuningReset,
  initialTimeline,
  subscribeTimeline,
}: {
  splineViz: boolean
  onSplineVizChange: (on: boolean) => void
  tuning: CursorTuningParams
  onTuningChange: (next: CursorTuningParams) => void
  onTuningReset: () => void
  initialTimeline: PresenceDebugEntry[]
  subscribeTimeline: (cb: (entry: PresenceDebugEntry) => void) => () => void
}) {
  return (
    <div className="flex h-full w-full min-w-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <PresencePlayground tuning={tuning} />
        </div>
        <div className="flex h-[45%] min-h-[160px] shrink-0 flex-col">
          <PresenceTimelinePanel
            initialEntries={initialTimeline}
            subscribe={subscribeTimeline}
          />
        </div>
      </div>
      <div className="w-80 shrink-0 overflow-y-auto border-l border-[var(--surface-popover-border)]">
        <TuningControls
          splineViz={splineViz}
          onSplineVizChange={onSplineVizChange}
          tuning={tuning}
          onTuningChange={onTuningChange}
          onTuningReset={onTuningReset}
        />
      </div>
    </div>
  )
}

function TuningControls({
  splineViz,
  onSplineVizChange,
  tuning,
  onTuningChange,
  onTuningReset,
}: {
  splineViz: boolean
  onSplineVizChange: (on: boolean) => void
  tuning: CursorTuningParams
  onTuningChange: (next: CursorTuningParams) => void
  onTuningReset: () => void
}) {
  const patch = (p: Partial<CursorTuningParams>) =>
    onTuningChange({ ...tuning, ...p })

  return (
    <div className="flex flex-col gap-4 p-4 text-[12px]">
      <Header title="Director tuning" onReset={onTuningReset} />

      <Field
        label="Base speed"
        value={`${tuning.baseSpeedPxS} px/s`}
        help="Arc-length travel rate before distance scaling."
      >
        <input
          type="range"
          min={50}
          max={2000}
          step={10}
          value={tuning.baseSpeedPxS}
          onChange={(e) => patch({ baseSpeedPxS: Number(e.target.value) })}
          className="w-full accent-blue-600"
        />
      </Field>

      <Field
        label="Distance scaling"
        value={tuning.distanceScaling.toFixed(2)}
        help="1 = constant speed (travel time grows with distance). 0 = constant duration regardless of distance, so short hops no longer teleport."
      >
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={tuning.distanceScaling}
          onChange={(e) => patch({ distanceScaling: Number(e.target.value) })}
          className="w-full accent-blue-600"
        />
      </Field>

      <Field
        label="Easing"
        help="Time-axis curve applied across each spline. Legacy default was easeInOutCubic; linear reproduces the constant-speed behavior."
      >
        <EasingPicker
          value={tuning.easing}
          onChange={(next) => patch({ easing: next })}
        />
      </Field>

      <Field
        label="Sync cap"
        value={`${tuning.syncCapMs} ms`}
        help="Upper bound for move-then-act. If the cursor arrives sooner, the mutation fires immediately; otherwise it fires at this cap."
      >
        <input
          type="range"
          min={0}
          max={1000}
          step={10}
          value={tuning.syncCapMs}
          onChange={(e) => patch({ syncCapMs: Number(e.target.value) })}
          className="w-full accent-blue-600"
        />
      </Field>

      <Field
        label="Commit hold"
        value={`${tuning.commitHoldMs} ms`}
        help="Duration of the 'committing' phase (ripple hold) at commit waypoints."
      >
        <input
          type="range"
          min={0}
          max={1000}
          step={10}
          value={tuning.commitHoldMs}
          onChange={(e) => patch({ commitHoldMs: Number(e.target.value) })}
          className="w-full accent-blue-600"
        />
      </Field>

      <Field
        label="Dwell"
        value={`${tuning.commitDwellMs} ms`}
        help="Pause at non-commit waypoints that request a dwell."
      >
        <input
          type="range"
          min={0}
          max={1000}
          step={10}
          value={tuning.commitDwellMs}
          onChange={(e) => patch({ commitDwellMs: Number(e.target.value) })}
          className="w-full accent-blue-600"
        />
      </Field>

      <hr className="border-[var(--surface-popover-border)]" />

      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">Visualize cursor splines</div>
          <div className="mt-0.5 text-[11px] opacity-60">
            Overlays the active spline on the real canvas behind each agent
            cursor (separate from the playground above).
          </div>
        </div>
        <label className="flex shrink-0 items-center gap-2">
          <input
            type="checkbox"
            checked={splineViz}
            onChange={(e) => onSplineVizChange(e.target.checked)}
          />
          <span>{splineViz ? 'On' : 'Off'}</span>
        </label>
      </div>
    </div>
  )
}

function Header({ title, onReset }: { title: string; onReset: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-[11px] font-semibold uppercase tracking-wider opacity-60">
        {title}
      </div>
      <button
        type="button"
        onClick={onReset}
        className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        Reset
      </button>
    </div>
  )
}

function EasingPicker({
  value,
  onChange,
}: {
  value: EasingSpec
  onChange: (next: EasingSpec) => void
}) {
  const selectValue: EasingPreset | 'custom' =
    value.kind === 'custom' ? 'custom' : value.name

  const onSelect = (next: string) => {
    if (next === 'custom') {
      onChange({ kind: 'custom', x1: 0.4, y1: 0, x2: 0.2, y2: 1 })
    } else {
      onChange({ kind: 'preset', name: next as EasingPreset })
    }
  }

  return (
    <>
      <select
        value={selectValue}
        onChange={(e) => onSelect(e.target.value)}
        className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-[12px] dark:border-zinc-700 dark:bg-zinc-900"
      >
        {EASING_PRESETS.map((preset) => (
          <option key={preset} value={preset}>
            {preset}
          </option>
        ))}
        <option value="custom">custom cubic-bezier</option>
      </select>
      {value.kind === 'custom' ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(['x1', 'y1', 'x2', 'y2'] as const).map((key) => (
            <div key={key}>
              <label className="text-[10px] uppercase tracking-wider opacity-60">
                {key}
              </label>
              <input
                type="number"
                step={0.05}
                value={value[key]}
                onChange={(e) =>
                  onChange({ ...value, [key]: Number(e.target.value) })
                }
                className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-1 py-0.5 text-[12px] tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
          ))}
        </div>
      ) : null}
    </>
  )
}

function Field({
  label,
  value,
  help,
  children,
}: {
  label: string
  value?: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-[11px] font-medium opacity-70">{label}</label>
        {value !== undefined ? (
          <span className="text-[11px] tabular-nums opacity-60">{value}</span>
        ) : null}
      </div>
      {children}
      {help ? (
        <div className="mt-1 text-[10px] leading-snug opacity-55">{help}</div>
      ) : null}
    </div>
  )
}
