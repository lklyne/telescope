import { Annotation, Compartment, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

export const externalUpdate = Annotation.define<boolean>()

// Shared metrics — must match `.text-block-markdown` rules in
// shared/markdownStyles.css so view↔edit mode swap doesn't reflow.
export const MARKDOWN_TOKENS = {
  fontSize: '12px',
  fontFamily: 'system-ui, sans-serif',
  lineHeight: '1.5',
  headingWeight: '600',
  h1Size: '1.4em',
  h2Size: '1.2em',
  h3Size: '1.1em',
  linkColor: '#2563eb',
} as const

const markdownHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontWeight: MARKDOWN_TOKENS.headingWeight, fontSize: MARKDOWN_TOKENS.h1Size },
  { tag: t.heading2, fontWeight: MARKDOWN_TOKENS.headingWeight, fontSize: MARKDOWN_TOKENS.h2Size },
  { tag: t.heading3, fontWeight: MARKDOWN_TOKENS.headingWeight, fontSize: MARKDOWN_TOKENS.h3Size },
  { tag: t.heading4, fontWeight: MARKDOWN_TOKENS.headingWeight },
  { tag: t.heading5, fontWeight: MARKDOWN_TOKENS.headingWeight },
  { tag: t.heading6, fontWeight: MARKDOWN_TOKENS.headingWeight },
  { tag: t.strong, fontWeight: MARKDOWN_TOKENS.headingWeight },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, textDecoration: 'underline', color: MARKDOWN_TOKENS.linkColor },
  { tag: t.url, color: MARKDOWN_TOKENS.linkColor },
  {
    tag: t.monospace,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  { tag: t.processingInstruction, opacity: '0.45' },
  { tag: t.contentSeparator, opacity: '0.45' },
  { tag: t.quote, fontStyle: 'italic' },
])

function buildEditorTheme(isDark: boolean): Extension {
  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'transparent',
        color: isDark ? '#e7e5e4' : '#1c1917',
        fontSize: MARKDOWN_TOKENS.fontSize,
        fontFamily: MARKDOWN_TOKENS.fontFamily,
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
        lineHeight: MARKDOWN_TOKENS.lineHeight,
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
