import { useEffect, useState } from 'react'
import type { ThemeData } from '../../../shared/types'

export function useTheme(
  initialTheme: ThemeData,
  onThemeChanged: (callback: (data: { isDark: boolean }) => void) => () => void
): boolean {
  const [isDark, setIsDark] = useState(() => {
    const nextIsDark = initialTheme.isDark
    document.documentElement.classList.toggle('dark', nextIsDark)
    return nextIsDark
  })

  useEffect(() => {
    const cleanup = onThemeChanged(({ isDark }) => {
      setIsDark(isDark)
      document.documentElement.classList.toggle('dark', isDark)
    })
    return cleanup
  }, [onThemeChanged])

  return isDark
}
