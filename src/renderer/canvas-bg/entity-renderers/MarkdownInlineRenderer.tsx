import { useCallback, useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { CanvasSceneFileEntity } from '../../../shared/types'
import { filePathToSrc, getFileApi } from './filePathToSrc'
import {
  createMarkdownExtensions,
  externalUpdate,
  reconfigureTheme,
} from './markdown-codemirror'

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

  // Covers external edits by agents/editors while the window was hidden.
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

  useEffect(() => {
    if (!canEdit && isFocusedRef.current) {
      isFocusedRef.current = false
      onTextEditingChange(false)
    }
  }, [canEdit, onTextEditingChange])

  // Editor refs and callbacks
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const themeCompartmentRef = useRef<Compartment | null>(null)
  const handleChangeRef = useRef<(value: string) => void>(() => {})
  const handleFocusRef = useRef<() => void>(() => {})
  const handleBlurRef = useRef<() => void>(() => {})

  handleChangeRef.current = (value: string) => {
    setLocalText(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fileApi.writeNoteFile(entity.file, value)
      debounceRef.current = null
    }, 300)
  }

  handleFocusRef.current = () => {
    isFocusedRef.current = true
    onTextEditingChange(true)
  }

  handleBlurRef.current = () => {
    isFocusedRef.current = false
    onTextEditingChange(false)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    fileApi.writeNoteFile(entity.file, localText)
    setMdContent(localText)
  }

  // Mount the editor whenever we enter edit mode.
  useEffect(() => {
    if (!canEdit) return
    const container = containerRef.current
    if (!container) return

    const { extensions, themeCompartment } = createMarkdownExtensions(isDark)
    themeCompartmentRef.current = themeCompartment

    const view = new EditorView({
      state: EditorState.create({
        doc: localText,
        extensions: [
          ...extensions,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            if (
              update.transactions.some((tr) => tr.annotation(externalUpdate))
            ) {
              return
            }
            handleChangeRef.current(update.state.doc.toString())
          }),
          EditorView.domEventHandlers({
            focus: () => {
              handleFocusRef.current()
              return false
            },
            blur: () => {
              handleBlurRef.current()
              return false
            },
            mousedown: (event) => {
              event.stopPropagation()
              return false
            },
          }),
        ],
      }),
      parent: container,
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
      themeCompartmentRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit])

  // Theme can change without re-mounting the editor.
  useEffect(() => {
    const view = viewRef.current
    const compartment = themeCompartmentRef.current
    if (!view || !compartment) return
    reconfigureTheme(view, compartment, isDark)
  }, [isDark])

  // Push external doc updates (file reload) into the editor when it isn't focused.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.hasFocus) return
    const current = view.state.doc.toString()
    if (current === localText) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: localText },
      annotations: externalUpdate.of(true),
    })
  }, [localText])

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: 12 }}>
      {canEdit ? (
        <div
          ref={containerRef}
          className="markdown-codemirror-host"
          style={{ width: '100%', height: '100%' }}
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
