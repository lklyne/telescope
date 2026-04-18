/**
 * Narration debug panel — toggles and diagnostic controls for the
 * narration director. Initial cut just exposes the spline viz toggle;
 * director tuning (base speed, drift radius, dwell ms) lands in a follow-up.
 */

export function NarrationSection({
  splineViz,
  onSplineVizChange,
}: {
  splineViz: boolean
  onSplineVizChange: (on: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-4 p-4 text-[12px]">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">Visualize cursor splines</div>
          <div className="mt-0.5 text-[11px] opacity-60">
            Overlays the active Catmull-Rom spline and waypoint rects behind
            each agent cursor.
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
      <hr className="border-[var(--surface-popover-border)]" />
      <div className="text-[11px] opacity-60">
        Director tuning (base speed, tension, drift, dwell) will appear here
        in a follow-up. For now, values are constants in the director module.
      </div>
    </div>
  )
}
