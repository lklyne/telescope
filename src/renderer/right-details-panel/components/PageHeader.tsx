export function PageHeader({
  pageLabel,
  pageWidth,
  pageHeight,
  pageUrl,
  mutedClass,
}: {
  pageLabel: string
  pageWidth?: number
  pageHeight?: number
  pageUrl?: string
  mutedClass: string
}) {
  return (
    <div className="px-1">
      <div className="min-w-0 text-[13px] font-semibold leading-5">
        <span>{pageLabel}</span>
        {typeof pageWidth === 'number' && typeof pageHeight === 'number' ? (
          <span className={`ml-1 font-normal ${mutedClass}`}>
            {pageWidth}x{pageHeight}
          </span>
        ) : null}
      </div>
      {pageUrl ? (
        <div
          className={`min-w-0 break-all text-[11px] leading-4 ${mutedClass}`}
          title={pageUrl}
        >
          {pageUrl}
        </div>
      ) : null}
    </div>
  )
}
