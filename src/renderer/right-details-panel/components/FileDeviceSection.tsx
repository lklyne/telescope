import { ChevronDown, Monitor, Smartphone, Tablet } from 'lucide-react'
import type { PanelFileEntityDetail } from '../../../shared/types'
import { DEVICE_CATALOG } from '../../../shared/device-catalog'
import { VIEWPORT_PRESETS } from '../../../shared/constants'
import { PagePresetDropdown } from '../../shared/PagePresetDropdown'
import { rightDetailsPanelApi } from '../rightDetailsPanelApi'

function OrientationIcon({ category, size, className }: { category: string; size: number; className?: string }) {
  const isMobile = category === 'iphone'
  const isTablet = category === 'ipad'
  if (isMobile) return <Smartphone size={size} className={className} />
  if (isTablet) return <Tablet size={size} className={className} />
  return <Monitor size={size} className={className} />
}

export function FileDeviceSection({
  fileEntity,
  isDark,
  divider,
}: {
  fileEntity: PanelFileEntityDetail
  isDark: boolean
  divider: string
}) {
  const orientation = fileEntity.deviceOrientation ?? 'portrait'
  const showShell = fileEntity.showDeviceFrame ?? false
  const deviceId = fileEntity.deviceId ?? null
  const dev = deviceId ? DEVICE_CATALOG.get(deviceId) : null
  const supportsOrientation = !!dev

  const preset = fileEntity.presetIndex != null ? VIEWPORT_PRESETS[fileEntity.presetIndex] : null
  const isCustom = !preset || fileEntity.width !== preset.width || fileEntity.height !== preset.height
  const triggerLabel = isCustom ? 'Custom' : `${preset.label} (${preset.width}\u00d7${preset.height})`

  const triggerClassName =
    'flex h-7 min-w-0 flex-1 items-center justify-between gap-1 rounded-md border border-[var(--surface-input-border)] bg-[var(--surface-input)] px-2 text-[11px] hover:border-[var(--surface-toolbar-border)]'

  const tabBg = 'bg-[var(--surface-interactive)] border border-[var(--surface-input-border)]'
  const tabActive = isDark
    ? 'bg-[var(--surface-toolbar)] text-zinc-100'
    : 'bg-[var(--surface-input)] text-zinc-800 shadow-sm'
  const tabInactive = isDark
    ? 'text-zinc-500 hover:text-zinc-300'
    : 'text-zinc-400 hover:text-zinc-600'

  return (
    <section className={`border-t ${divider}`}>
      <div className="flex items-center gap-2 px-2 py-2">
        <PagePresetDropdown
          align="start"
          isDark={isDark}
          side="bottom"
          sideOffset={4}
          onSelectPreset={(index) => rightDetailsPanelApi.setFilePreset(fileEntity.id, index)}
          onSelectCustom={() => rightDetailsPanelApi.setFileCustom(fileEntity.id)}
          trigger={
            <button type="button" className={triggerClassName}>
              <span className="min-w-0 truncate">{triggerLabel}</span>
              <ChevronDown size={10} className="shrink-0 text-[var(--surface-toolbar-foreground)] opacity-50" />
            </button>
          }
        />

        {supportsOrientation ? (
          <div className={`flex shrink-0 rounded-md ${tabBg} p-0.5`}>
            <button
              type="button"
              className={`rounded px-1.5 py-1 transition-colors ${
                orientation === 'portrait' ? tabActive : tabInactive
              }`}
              title="Portrait"
              onClick={() => rightDetailsPanelApi.setFileDeviceOrientation(fileEntity.id, 'portrait')}
            >
              <OrientationIcon category={dev!.category} size={14} />
            </button>
            <button
              type="button"
              className={`rounded px-1.5 py-1 transition-colors ${
                orientation === 'landscape' ? tabActive : tabInactive
              }`}
              title="Landscape"
              onClick={() => rightDetailsPanelApi.setFileDeviceOrientation(fileEntity.id, 'landscape')}
            >
              <OrientationIcon category={dev!.category} size={14} className="rotate-90" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 px-2 pb-2">
        <label className="flex items-center gap-1.5 text-[11px]">
          <input
            type="checkbox"
            checked={showShell}
            onChange={() => rightDetailsPanelApi.toggleFileDeviceShell(fileEntity.id)}
            className="accent-blue-500"
          />
          Show device page
        </label>
      </div>
    </section>
  )
}
