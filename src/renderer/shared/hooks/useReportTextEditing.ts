import { useEffect } from 'react'
import { isTypingTarget } from '../../../shared/gesture-utils'

export function useReportTextEditing(setTextEditing: (active: boolean) => void) {
  useEffect(() => {
    const sync = () => {
      setTextEditing(isTypingTarget(document.activeElement))
    }

    const onFocusIn = () => sync()
    const onFocusOut = () => queueMicrotask(sync)

    sync()
    window.addEventListener('focusin', onFocusIn)
    window.addEventListener('focusout', onFocusOut)

    return () => {
      window.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('focusout', onFocusOut)
      setTextEditing(false)
    }
  }, [setTextEditing])
}
