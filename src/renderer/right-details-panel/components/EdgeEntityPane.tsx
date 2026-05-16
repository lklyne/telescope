import { useState } from 'react'
import { ArrowRight, Trash2 } from 'lucide-react'
import type { EdgeEnd, EdgeSide, PanelEdgeEntityDetail } from '../../../shared/types'
import { dividerClass, mutedClass, paneDeleteBtnClass } from '../rightDetailsPanelHelpers'
import { rightDetailsPanelApi } from '../rightDetailsPanelApi'
import { ColorSwatchPicker } from './ColorSwatchPicker'
import { PaneHeader } from './PaneHeader'

const EDGE_END_OPTIONS: EdgeEnd[] = ['none', 'arrow']
const EDGE_SIDE_OPTIONS: Array<{ value: EdgeSide | ''; label: string }> = [
  { value: '', label: 'Auto' },
  { value: 'top', label: 'Top' },
  { value: 'right', label: 'Right' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
]

function SelectField({
  label,
  value,
  options,
  onChange,
  isDark,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  isDark: boolean
}) {
  const selectClass = isDark
    ? 'rounded bg-zinc-800 px-1.5 py-1 text-[11px] text-zinc-100 border border-zinc-700'
    : 'rounded bg-zinc-100 px-1.5 py-1 text-[11px] text-zinc-900 border border-zinc-200'

  return (
    <div className="flex items-center justify-between">
      <span className={`text-[10px] font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{label}</span>
      <select
        className={selectClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

export function EdgeEntityPane({
  edgeEntity,
  isDark,
}: {
  edgeEntity: PanelEdgeEntityDetail
  isDark: boolean
}) {
  const muted = mutedClass(isDark)
  const divider = dividerClass(isDark)
  const deleteBtnClass = paneDeleteBtnClass(isDark)

  const [labelDraft, setLabelDraft] = useState<string | null>(null)
  const labelValue = labelDraft ?? edgeEntity.label ?? ''

  return (
    <div className="flex flex-col">
      <PaneHeader
        icon={<ArrowRight size={14} className="shrink-0 text-zinc-500" />}
        label="Edge"
        actions={
          <>
            <span className={`text-[10px] ${muted}`}>{edgeEntity.kind.replace('_', ' ')}</span>
            <button
              type="button"
              className={deleteBtnClass}
              onClick={() => rightDetailsPanelApi.deleteEdge(edgeEntity.id)}
              title="Delete"
              aria-label="Delete Edge"
            >
              <Trash2 size={14} />
            </button>
          </>
        }
      />

      <div className={`border-t px-2 pt-2 pb-2 ${divider}`}>
        <ColorSwatchPicker
          activeColor={edgeEntity.color}
          allowNone
          isDark={isDark}
          palette="vivid"
          onSelectColor={(color) => rightDetailsPanelApi.updateEdge(edgeEntity.id, { color })}
        />
      </div>

      <div className={`border-t px-2 pt-2 pb-2 ${divider}`}>
        <div className={`mb-1 text-[10px] font-medium ${muted}`}>Label</div>
        <input
          type="text"
          className={`w-full rounded px-2 py-1 text-[11px] ${
            isDark
              ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 placeholder:text-zinc-500'
              : 'bg-zinc-100 text-zinc-900 border border-zinc-200 placeholder:text-zinc-400'
          }`}
          placeholder="Optional label…"
          value={labelValue}
          onChange={(e) => setLabelDraft(e.target.value)}
          onBlur={() => {
            rightDetailsPanelApi.updateEdge(edgeEntity.id, { label: labelValue })
            setLabelDraft(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              rightDetailsPanelApi.updateEdge(edgeEntity.id, { label: labelValue })
              setLabelDraft(null)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
      </div>

      <div className={`border-t px-2 pt-2 pb-2 ${divider}`}>
        <div className="flex flex-col gap-2">
          <div>
            <div className={`mb-0.5 text-[10px] font-medium ${muted}`}>From</div>
            <div className="text-[11px]">{edgeEntity.fromLabel}</div>
          </div>
          <div>
            <div className={`mb-0.5 text-[10px] font-medium ${muted}`}>To</div>
            <div className="text-[11px]">{edgeEntity.toLabel}</div>
          </div>
        </div>
      </div>

      <div className={`border-t px-2 pt-2 pb-2 ${divider}`}>
        <div className={`mb-1.5 text-[10px] font-medium ${muted}`}>Endpoints</div>
        <div className="flex flex-col gap-1.5">
          <SelectField
            label="Start"
            value={edgeEntity.fromEnd ?? 'none'}
            options={EDGE_END_OPTIONS.map((v) => ({ value: v, label: v === 'none' ? 'None' : 'Arrow' }))}
            onChange={(v) => rightDetailsPanelApi.updateEdge(edgeEntity.id, { fromEnd: v as EdgeEnd })}
            isDark={isDark}
          />
          <SelectField
            label="End"
            value={edgeEntity.toEnd ?? 'arrow'}
            options={EDGE_END_OPTIONS.map((v) => ({ value: v, label: v === 'none' ? 'None' : 'Arrow' }))}
            onChange={(v) => rightDetailsPanelApi.updateEdge(edgeEntity.id, { toEnd: v as EdgeEnd })}
            isDark={isDark}
          />
        </div>
      </div>

      <div className={`border-t px-2 pt-2 pb-2 ${divider}`}>
        <div className={`mb-1.5 text-[10px] font-medium ${muted}`}>Sides</div>
        <div className="flex flex-col gap-1.5">
          <SelectField
            label="From side"
            value={edgeEntity.fromSide ?? ''}
            options={EDGE_SIDE_OPTIONS}
            onChange={(v) => rightDetailsPanelApi.updateEdge(edgeEntity.id, { fromSide: (v || undefined) as EdgeSide | undefined })}
            isDark={isDark}
          />
          <SelectField
            label="To side"
            value={edgeEntity.toSide ?? ''}
            options={EDGE_SIDE_OPTIONS}
            onChange={(v) => rightDetailsPanelApi.updateEdge(edgeEntity.id, { toSide: (v || undefined) as EdgeSide | undefined })}
            isDark={isDark}
          />
        </div>
      </div>
    </div>
  )
}
