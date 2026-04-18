import type {
  CursorMotionParams,
  CurveDirection,
  EasingPreset,
  EasingSpec,
} from '../../shared/types'

const EASING_PRESETS: EasingPreset[] = [
  'linear',
  'easeInOutCubic',
  'easeOutExpo',
  'easeInOutQuart',
  'easeOutBack',
  'easeInOutSine',
]

const DIRECTIONS: CurveDirection[] = ['auto', 'left', 'right', 'alternating']

export function ControlsPanel({
  params,
  onChange,
  onReset,
}: {
  params: CursorMotionParams
  onChange: (next: CursorMotionParams) => void
  onReset: () => void
}) {
  const patch = (p: Partial<CursorMotionParams>) => onChange({ ...params, ...p })

  const easingSelectValue: EasingPreset | 'custom' =
    params.easing.kind === 'custom' ? 'custom' : params.easing.name

  const onEasingChange = (value: string) => {
    if (value === 'custom') {
      patch({
        easing: { kind: 'custom', x1: 0.4, y1: 0, x2: 0.2, y2: 1 },
      })
    } else {
      patch({ easing: { kind: 'preset', name: value as EasingPreset } })
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 text-[12px]">
      <Header title="Motion" onReset={onReset} />

      <Field label="Duration" value={`${params.durationMs} ms`}>
        <input
          type="range"
          min={50}
          max={2000}
          step={10}
          value={params.durationMs}
          onChange={(e) => patch({ durationMs: Number(e.target.value) })}
          className="w-full accent-blue-600"
        />
      </Field>

      <Field label="Distance scaling" value={params.distanceScaling.toFixed(2)}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={params.distanceScaling}
          onChange={(e) => patch({ distanceScaling: Number(e.target.value) })}
          className="w-full accent-blue-600"
        />
      </Field>

      <Field label="Curve strength" value={params.curveStrength.toFixed(2)}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={params.curveStrength}
          onChange={(e) => patch({ curveStrength: Number(e.target.value) })}
          className="w-full accent-blue-600"
        />
      </Field>

      <Field label="Curve asymmetry" value={params.curveAsymmetry.toFixed(2)}>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={params.curveAsymmetry}
          onChange={(e) => patch({ curveAsymmetry: Number(e.target.value) })}
          className="w-full accent-blue-600"
        />
      </Field>

      <Field label="Jitter" value={params.curveJitter.toFixed(2)}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={params.curveJitter}
          onChange={(e) => patch({ curveJitter: Number(e.target.value) })}
          className="w-full accent-blue-600"
        />
      </Field>

      <Field label="Curve direction">
        <div className="mt-1 flex gap-1">
          {DIRECTIONS.map((dir) => {
            const active = params.curveDirection === dir
            return (
              <button
                key={dir}
                type="button"
                onClick={() => patch({ curveDirection: dir })}
                className={`flex-1 rounded border px-2 py-1 text-[11px] capitalize ${
                  active
                    ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-300'
                    : 'border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800'
                }`}
              >
                {dir}
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Easing">
        <select
          value={easingSelectValue}
          onChange={(e) => onEasingChange(e.target.value)}
          className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-[12px] dark:border-zinc-700 dark:bg-zinc-900"
        >
          {EASING_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {preset}
            </option>
          ))}
          <option value="custom">custom cubic-bezier</option>
        </select>
      </Field>

      {params.easing.kind === 'custom' ? (
        <CustomBezierInputs
          easing={params.easing}
          onChange={(next) => patch({ easing: next })}
        />
      ) : null}
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

function Field({
  label,
  value,
  children,
}: {
  label: string
  value?: string
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
    </div>
  )
}

function CustomBezierInputs({
  easing,
  onChange,
}: {
  easing: Extract<EasingSpec, { kind: 'custom' }>
  onChange: (next: EasingSpec) => void
}) {
  const set = (key: 'x1' | 'y1' | 'x2' | 'y2', value: number) =>
    onChange({ ...easing, [key]: value })

  return (
    <div className="grid grid-cols-2 gap-2">
      {(['x1', 'y1', 'x2', 'y2'] as const).map((key) => (
        <div key={key}>
          <label className="text-[10px] uppercase tracking-wider opacity-60">
            {key}
          </label>
          <input
            type="number"
            step={0.05}
            value={easing[key]}
            onChange={(e) => set(key, Number(e.target.value))}
            className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-1 py-0.5 text-[12px] tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
      ))}
    </div>
  )
}
