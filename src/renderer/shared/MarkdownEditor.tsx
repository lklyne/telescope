import { useEffect, useRef } from 'react'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, placeholder as placeholderExtension } from '@codemirror/view'
import {
  createMarkdownExtensions,
  externalUpdate,
  reconfigureTheme,
} from '../canvas-bg/entity-renderers/markdown-codemirror'

/**
 * CodeMirror-based markdown editor. Renders the source as live-styled
 * markdown (heading sizes, bold, links) so edit and view modes share the
 * same visual metrics — see MARKDOWN_TOKENS in markdown-codemirror.ts.
 *
 * The host stops mousedown propagation so the canvas pointer router
 * doesn't treat clicks inside the editor as canvas drags.
 */
export function MarkdownEditor({
  value,
  onChange,
  onFocus,
  onBlur,
  onEscape,
  isDark,
  autoFocus = false,
  onAutoFocusConsumed,
  placeholder,
  className,
  style,
}: {
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  /** Called when the user presses Escape inside the editor. */
  onEscape?: () => void
  isDark: boolean
  autoFocus?: boolean
  onAutoFocusConsumed?: () => void
  placeholder?: string
  className?: string
  style?: React.CSSProperties
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const themeCompartmentRef = useRef<Compartment | null>(null)

  const onChangeRef = useRef(onChange)
  const onFocusRef = useRef(onFocus)
  const onBlurRef = useRef(onBlur)
  const onEscapeRef = useRef(onEscape)
  onChangeRef.current = onChange
  onFocusRef.current = onFocus
  onBlurRef.current = onBlur
  onEscapeRef.current = onEscape

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const { extensions, themeCompartment } = createMarkdownExtensions(isDark)
    themeCompartmentRef.current = themeCompartment

    const editorExtensions: Extension[] = [
      ...extensions,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return
        if (update.transactions.some((tr) => tr.annotation(externalUpdate))) {
          return
        }
        onChangeRef.current(update.state.doc.toString())
      }),
      EditorView.domEventHandlers({
        focus: () => {
          onFocusRef.current?.()
          return false
        },
        blur: () => {
          // Defer one tick: an Electron WCV layout/focus-reconcile can
          // briefly steal focus from contentDOM right as we enter
          // editing-entity, and immediately return it. If we fired onBlur
          // synchronously we'd commit the edit on every spurious thrash.
          // Skip when focus has come back by the next task.
          setTimeout(() => {
            if (viewRef.current?.hasFocus) return
            onBlurRef.current?.()
          }, 0)
          return false
        },
        mousedown: (event) => {
          event.stopPropagation()
          return false
        },
        keydown: (event) => {
          if (event.key === 'Escape' && onEscapeRef.current) {
            event.preventDefault()
            onEscapeRef.current()
            return true
          }
          return false
        },
      }),
    ]
    if (placeholder) editorExtensions.push(placeholderExtension(placeholder))

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: editorExtensions,
      }),
      parent: container,
    })
    viewRef.current = view

    if (autoFocus) {
      view.focus()
      view.dispatch({ selection: { anchor: view.state.doc.length } })
      onAutoFocusConsumed?.()
    }

    return () => {
      view.destroy()
      viewRef.current = null
      themeCompartmentRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    const compartment = themeCompartmentRef.current
    if (!view || !compartment) return
    reconfigureTheme(view, compartment, isDark)
  }, [isDark])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.hasFocus) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: externalUpdate.of(true),
    })
  }, [value])

  return (
    <div
      ref={containerRef}
      className={className}
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    />
  )
}
