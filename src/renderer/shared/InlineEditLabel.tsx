import { useEffect, useRef, useState, type ReactNode } from 'react'

type Variant = 'canvas-chrome' | 'sidebar-row'

interface InlineEditLabelProps {
  value: string
  isEditing: boolean
  onStartEdit?: () => void
  onCommit: (next: string) => void
  onCancel: () => void
  variant: Variant
  isDark?: boolean
  placeholder?: string
  titleClassName?: string
  inputClassName?: string
  onTitleClick?: () => void
  children?: (value: string) => ReactNode
}

const DEFAULT_TITLE_CLASS: Record<Variant, string> = {
  'canvas-chrome': 'min-w-0 truncate font-medium',
  'sidebar-row': 'min-w-0 flex-1 truncate',
}

function defaultInputClass(variant: Variant, isDark: boolean): string {
  if (variant === 'canvas-chrome') {
    return 'min-w-0 flex-1 border-0 bg-transparent text-xs font-medium outline-none placeholder:text-zinc-400 focus:outline-none'
  }
  return `min-w-0 flex-1 rounded-[4px] ring-1 p-0 text-xs leading-[inherit] font-[inherit] outline-none ${
    isDark ? 'ring-zinc-600 bg-zinc-950 text-zinc-100' : 'ring-zinc-300 bg-white text-zinc-900'
  }`
}

export function InlineEditLabel({
  value,
  isEditing,
  onStartEdit,
  onCommit,
  onCancel,
  variant,
  isDark = false,
  placeholder,
  titleClassName,
  inputClassName,
  onTitleClick,
  children,
}: InlineEditLabelProps) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) {
      setDraft(value)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing, value])

  function commit() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === value) {
      onCancel()
      return
    }
    onCommit(trimmed)
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        onBlur={commit}
        onFocus={(event) => event.target.select()}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        placeholder={placeholder}
        spellCheck={false}
        className={inputClassName ?? defaultInputClass(variant, isDark)}
      />
    )
  }

  const resolvedTitleClass = titleClassName ?? DEFAULT_TITLE_CLASS[variant]

  return (
    <span
      className={resolvedTitleClass}
      onClick={onTitleClick}
      onDoubleClick={
        onStartEdit
          ? (event) => {
              event.stopPropagation()
              onStartEdit()
            }
          : undefined
      }
      title={value}
    >
      {children ? children(value) : value}
    </span>
  )
}
