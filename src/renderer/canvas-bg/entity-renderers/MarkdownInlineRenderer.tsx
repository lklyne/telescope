import { useCallback, useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import type { CanvasSceneFileEntity } from '../../../shared/types'
import { filePathToSrc, getFileApi } from './filePathToSrc'

export function MarkdownInlineRenderer({
  entity,
  canEdit,
  isDark,
  onTextEditingChange,
}: {
  entity: CanvasSceneFileEntity
  canEdit: boolean
  isDark: boolean
  onTextEditingChange: (active: boolean) => void
}) {
  const fileApi = getFileApi()
  const [mdContent, setMdContent] = useState<string | null>(null)
  const [localText, setLocalText] = useState('')
  const isFocusedRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchContent = useCallback(() => {
    const src = filePathToSrc(entity.file) + `?t=${Date.now()}`
    fetch(src)
      .then((res) => res.text())
      .then((text) => {
        setMdContent(text)
        if (!isFocusedRef.current) setLocalText(text)
      })
      .catch(() => {})
  }, [entity.file])

  // Initial load.
  useEffect(() => {
    let cancelled = false
    fetch(filePathToSrc(entity.file))
      .then((res) => res.text())
      .then((text) => {
        if (cancelled) return
        setMdContent(text)
        if (!isFocusedRef.current) setLocalText(text)
      })
      .catch(() => {
        if (!cancelled) setMdContent(null)
      })
    return () => {
      cancelled = true
    }
  }, [entity.file])

  // Re-fetch when window regains visibility (covers external edits by agents/editors).
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      if (debounceRef.current) return
      if (isFocusedRef.current) return
      fetchContent()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [fetchContent])

  // Clear editing state when edit mode is lost.
  useEffect(() => {
    if (!canEdit && isFocusedRef.current) {
      isFocusedRef.current = false
      onTextEditingChange(false)
    }
  }, [canEdit, onTextEditingChange])

  const handleChange = (value: string) => {
    setLocalText(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fileApi.writeNoteFile(entity.file, value)
      debounceRef.current = null
    }, 300)
  }

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: 12 }}>
      {canEdit ? (
        <textarea
          className="text-block-textarea w-full h-full resize-none border-none outline-none bg-transparent"
          style={{
            fontSize: 12,
            color: isDark ? '#e7e5e4' : '#1c1917',
            fontFamily: 'system-ui, sans-serif',
          }}
          value={localText}
          placeholder="Write your note..."
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            isFocusedRef.current = true
            onTextEditingChange(true)
          }}
          onBlur={() => {
            isFocusedRef.current = false
            onTextEditingChange(false)
            if (debounceRef.current) {
              clearTimeout(debounceRef.current)
              debounceRef.current = null
            }
            fileApi.writeNoteFile(entity.file, localText)
            setMdContent(localText)
          }}
          onMouseDown={(e) => e.stopPropagation()}
        />
      ) : (
        <div
          className="text-block-markdown"
          style={{
            fontSize: 12,
            color: isDark ? '#e7e5e4' : '#1c1917',
            fontFamily: 'system-ui, sans-serif',
            wordBreak: 'break-word',
          }}
        >
          {mdContent != null ? (
            mdContent ? (
              <Markdown>{mdContent}</Markdown>
            ) : (
              <span style={{ opacity: 0.4 }}>Write your note...</span>
            )
          ) : (
            <span style={{ opacity: 0.4 }}>Loading...</span>
          )}
        </div>
      )}
    </div>
  )
}
