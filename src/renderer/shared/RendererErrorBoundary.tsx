/**
 * Top-level error boundary for renderer entry points.
 *
 * A thrown React render error normally unmounts the whole tree and leaves
 * a blank canvas. This boundary catches the error, logs it via console.error
 * (which the main process forwards to errors.log via wireRendererLogging),
 * and renders a high-contrast panel with the message + stack so the failure
 * is obvious without DevTools, and easy to copy from with native selection.
 */

import { Component, type ReactNode } from 'react'

interface Props {
  label: string
  children: ReactNode
}

interface State {
  error: Error | null
  componentStack: string | null
}

export class RendererErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    this.setState({ componentStack: info.componentStack ?? null })
    console.error(
      `[renderer-render-error:${this.props.label}] ${error.message}`,
      error.stack ?? '',
      info.componentStack ?? '',
    )
  }

  private copyAll = async (): Promise<void> => {
    const { error, componentStack } = this.state
    if (!error) return
    const payload = [
      `[${this.props.label}] ${error.message}`,
      '',
      'Stack:',
      error.stack ?? '<no stack>',
      '',
      'Component stack:',
      componentStack ?? '<none>',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(payload)
    } catch {
      // Clipboard API can fail in restricted contexts; the user can still
      // select-all + copy from the visible <pre>.
    }
  }

  render(): ReactNode {
    const { error, componentStack } = this.state
    if (!error) return this.props.children

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          // Solid backgrounds so this is readable in both themes; explicit
          // text colors so we don't inherit the canvas's transparent surface.
          background: '#fef2f2',
          color: '#7f1d1d',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 13,
          overflow: 'auto',
          // Make sure the user can select+copy text from this panel.
          userSelect: 'text',
          WebkitUserSelect: 'text',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            Renderer error in {this.props.label}
          </div>
          <button
            type="button"
            onClick={() => void this.copyAll()}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid #b91c1c',
              background: '#ffffff',
              color: '#7f1d1d',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Copy details
          </button>
          <button
            type="button"
            onClick={() => this.setState({ error: null, componentStack: null })}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid #b91c1c',
              background: 'transparent',
              color: '#7f1d1d',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Try to recover
          </button>
        </div>

        <div style={{ fontSize: 12, opacity: 0.85 }}>
          Also written to{' '}
          <code style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>
            ~/Library/Logs/Telescope/errors.log
          </code>
          . Tail it with{' '}
          <code style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>
            tail -f
          </code>{' '}
          if copying from this panel is awkward.
        </div>

        <pre
          style={{
            margin: 0,
            padding: 12,
            background: '#ffffff',
            color: '#7f1d1d',
            border: '1px solid #fecaca',
            borderRadius: 6,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'auto',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
        >
          {error.stack ?? error.message}
        </pre>

        {componentStack && (
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              Component stack
            </summary>
            <pre
              style={{
                margin: '8px 0 0',
                padding: 12,
                background: '#ffffff',
                color: '#7f1d1d',
                border: '1px solid #fecaca',
                borderRadius: 6,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflow: 'auto',
                userSelect: 'text',
                WebkitUserSelect: 'text',
              }}
            >
              {componentStack}
            </pre>
          </details>
        )}
      </div>
    )
  }
}
