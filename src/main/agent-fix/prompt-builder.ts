import type { Annotation } from '../../shared/types'
import { truncate } from '../../shared/annotation-utils'

export function buildFixPrompt(annotation: Annotation): string {
  const lines: string[] = []

  lines.push('You are fixing a UI comment left on a live web page.')
  lines.push('')

  const pageUrl = annotation.metadata?.pageUrl
  if (pageUrl) {
    lines.push(`Page URL: ${pageUrl}`)
  }

  const frameName = annotation.metadata?.frameName
  if (frameName) {
    lines.push(`Frame: ${frameName}`)
  }

  const inspect = annotation.metadata?.inspectContext
  if (inspect) {
    if (inspect.sourceLocation) {
      const { file, line, column } = inspect.sourceLocation
      const ref = line != null
        ? column != null ? `${file}:${line}:${column}` : `${file}:${line}`
        : file
      lines.push(`Element source: ${ref}`)
    }
    if (inspect.reactComponents?.length) {
      lines.push(`React components (inner to outer): ${inspect.reactComponents.join(' > ')}`)
    }
    if (inspect.name) {
      lines.push(`Element name: ${inspect.name}`)
    }
    if (inspect.tagName) {
      lines.push(`Tag: <${inspect.tagName.toLowerCase()}>`)
    }
    if (inspect.textPreview) {
      lines.push(`Text preview: ${truncate(inspect.textPreview, 160)}`)
    }
    if (inspect.elementPath) {
      lines.push(`Element path: ${inspect.elementPath}`)
    }
    if (inspect.boundingBox) {
      const { x, y, width, height } = inspect.boundingBox as {
        x: number; y: number; width: number; height: number
      }
      lines.push(`Bounding box: x=${Math.round(x)} y=${Math.round(y)} w=${Math.round(width)} h=${Math.round(height)}`)
    }
  }

  if (annotation.anchor.type === 'element' && !inspect?.elementPath) {
    lines.push(`Selector: ${annotation.anchor.selector}`)
  }

  lines.push('')
  lines.push('Thread:')
  lines.push(`[${labelForAuthor(annotation.author)}] ${annotation.text}`)
  for (const reply of annotation.replies) {
    lines.push(`[${labelForAuthor(reply.author)}] ${reply.text}`)
  }

  lines.push('')
  lines.push('Make the minimal code change in this repo to address the feedback.')
  lines.push('Verify your change does not break typecheck when reasonable.')
  lines.push('')
  lines.push('Reply format — REQUIRED:')
  lines.push('- Your final output MUST end with one short IM-style summary line (under 280 chars), then a newline, then one of:')
  lines.push('  <<RESOLVE>>   if you believe the issue is now fixed')
  lines.push('  <<WAITING>>   if you need more information from the user')
  lines.push('Do not write anything after the marker.')

  return lines.join('\n')
}

function labelForAuthor(author: 'user' | 'agent'): string {
  return author === 'agent' ? 'Agent' : 'User'
}
