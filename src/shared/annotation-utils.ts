import type { Annotation } from './types'

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return value.slice(0, max - 1) + '…'
}

export function annotationOrigin(annotation: Annotation): string | null {
  const pageUrl = annotation.metadata?.pageUrl
  if (!pageUrl) return null
  try {
    return new URL(pageUrl).origin
  } catch {
    return null
  }
}
