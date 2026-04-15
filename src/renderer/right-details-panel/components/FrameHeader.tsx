export function FrameHeader({
  frameLabel,
  frameWidth,
  frameHeight,
  frameUrl,
  mutedClass,
}: {
  frameLabel: string
  frameWidth?: number
  frameHeight?: number
  frameUrl?: string
  mutedClass: string
}) {
  return (
    <div className="px-1">
      <div className="min-w-0 text-[13px] font-semibold leading-5">
        <span>{frameLabel}</span>
        {typeof frameWidth === 'number' && typeof frameHeight === 'number' ? (
          <span className={`ml-1 font-normal ${mutedClass}`}>
            {frameWidth}x{frameHeight}
          </span>
        ) : null}
      </div>
      {frameUrl ? (
        <div
          className={`min-w-0 break-all text-[11px] leading-4 ${mutedClass}`}
          title={frameUrl}
        >
          {frameUrl}
        </div>
      ) : null}
    </div>
  )
}
