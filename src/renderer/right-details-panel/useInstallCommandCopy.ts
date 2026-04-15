import { useEffect, useRef, useState } from 'react'

export function useInstallCommandCopy() {
  const [copiedInstall, setCopiedInstall] = useState<'idle' | 'ok' | 'err'>('idle')
  const copiedInstallTimeoutRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (copiedInstallTimeoutRef.current !== null) {
        window.clearTimeout(copiedInstallTimeoutRef.current)
      }
    },
    [],
  )

  async function copyInstallCommand(command: string): Promise<void> {
    if (copiedInstallTimeoutRef.current !== null) {
      window.clearTimeout(copiedInstallTimeoutRef.current)
      copiedInstallTimeoutRef.current = null
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(command)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = command
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(textarea)
        if (!ok) throw new Error('copy failed')
      }
      setCopiedInstall('ok')
      copiedInstallTimeoutRef.current = window.setTimeout(() => {
        setCopiedInstall('idle')
        copiedInstallTimeoutRef.current = null
      }, 1500)
    } catch {
      setCopiedInstall('err')
      copiedInstallTimeoutRef.current = window.setTimeout(() => {
        setCopiedInstall('idle')
        copiedInstallTimeoutRef.current = null
      }, 2000)
    }
  }

  return {
    copiedInstall,
    copyInstallCommand,
  }
}
