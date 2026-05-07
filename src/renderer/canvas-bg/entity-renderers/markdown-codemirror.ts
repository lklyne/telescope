import { Annotation, Compartment, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

export const externalUpdate = Annotation.define<boolean>()

const markdownHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontWeight: 'bold', fontSize: '1.5em' },
  { tag: t.heading2, fontWeight: 'bold', fontSize: '1.3em' },
  { tag: t.heading3, fontWeight: 'bold', fontSize: '1.15em' },
  { tag: t.heading4, fontWeight: 'bold' },
  { tag: t.heading5, fontWeight: 'bold' },
  { tag: t.heading6, fontWeight: 'bold' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, textDecoration: 'underline' },
  { tag: t.url, color: '#3b82f6' },
  {
    tag: t.monospace,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  { tag: t.processingInstruction, opacity: '0.45' },
  { tag: t.contentSeparator, opacity: '0.45' },
  { tag: t.quote, opacity: '0.85', fontStyle: 'italic' },
  { tag: t.list, opacity: '0.85' },
])

function buildEditorTheme(isDark: boolean): Extension {
  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'transparent',
        color: isDark ? '#e7e5e4' : '#1c1917',
        fontSize: '12px',
        fontFamily: 'system-ui, sans-serif',
        height: '100%',
      },
      '.cm-content': {
        padding: '0',
        caretColor: isDark ? '#e7e5e4' : '#1c1917',
      },
      '.cm-line': { padding: '0' },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: 'inherit',
        lineHeight: '1.5',
      },
      '.cm-gutters': { display: 'none' },
    },
    { dark: isDark },
  )
}

export function reconfigureTheme(
  view: EditorView,
  compartment: Compartment,
  isDark: boolean,
) {
  view.dispatch({ effects: compartment.reconfigure(buildEditorTheme(isDark)) })
}

export function createMarkdownExtensions(isDark: boolean): {
  extensions: Extension[]
  themeCompartment: Compartment
} {
  const themeCompartment = new Compartment()
  return {
    extensions: [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown(),
      syntaxHighlighting(markdownHighlightStyle),
      EditorView.lineWrapping,
      themeCompartment.of(buildEditorTheme(isDark)),
    ],
    themeCompartment,
  }
}
