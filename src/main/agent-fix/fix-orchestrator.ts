import type { Annotation } from '../../shared/types'
import { annotationOrigin, truncate } from '../../shared/annotation-utils'
import {
  addAnnotationReply,
  getAnnotationById,
  getAnnotations,
  setOnAnnotationCreated,
  updateAnnotationStatus,
} from '../workspace-annotations'
import { getOriginBinding } from '../runtime/preferences'
import { buildFixPrompt } from './prompt-builder'
import { invokeClaude, type FixResult } from './claude-spawner'
import { enqueueFix, isAnnotationInFlight } from './fix-queue'

const MAX_AGENT_REPLIES = 20

export function initFixOrchestrator(): void {
  setOnAnnotationCreated((annotation) => {
    if (annotation.author !== 'user') return
    const origin = annotationOrigin(annotation)
    if (!origin) return
    const binding = getOriginBinding(origin)
    if (!binding || !binding.autoFix) return
    fixAnnotation(annotation.id)
  })
}

export function fixAnnotation(annotationId: string): boolean {
  const annotation = getAnnotationById(annotationId)
  if (!annotation) return false
  return fixAnnotationCore(annotation)
}

export function fixPendingAnnotationsForOrigin(origin: string): number {
  const binding = getOriginBinding(origin)
  if (!binding) return 0
  const candidates = getAnnotations().filter((a) => {
    if (a.status === 'resolved' || a.status === 'dismissed') return false
    return annotationOrigin(a) === origin
  })
  let queued = 0
  for (const candidate of candidates) {
    if (fixAnnotationCore(candidate)) queued++
  }
  return queued
}

function fixAnnotationCore(annotation: Annotation): boolean {
  if (isAnnotationInFlight(annotation.id)) return false

  const origin = annotationOrigin(annotation)
  if (!origin) {
    addAnnotationReply(annotation.id, 'agent', 'Cannot fix: annotation has no associated page URL.')
    return false
  }
  const binding = getOriginBinding(origin)
  if (!binding) {
    addAnnotationReply(annotation.id, 'agent', `Cannot fix: no repo linked to ${origin}. Link one in the Comments panel.`)
    return false
  }
  const agentReplies = annotation.replies.filter((r) => r.author === 'agent').length
  if (agentReplies >= MAX_AGENT_REPLIES) {
    addAnnotationReply(annotation.id, 'agent', 'Agent reply cap reached. Resolve manually or reopen with a new comment.')
    return false
  }

  const prompt = buildFixPrompt(annotation)
  updateAnnotationStatus(annotation.id, 'acknowledged')

  return enqueueFix({
    annotationId: annotation.id,
    origin,
    repoPath: binding.repoPath,
    run: () => invokeClaude(prompt, binding.repoPath),
    onComplete: (result, error) => handleCompletion(annotation.id, result, error),
  })
}

function handleCompletion(
  annotationId: string,
  result: FixResult | null,
  error: Error | null,
): void {
  if (error || !result) {
    const message = error ? error.message : 'Unknown error from fix runner.'
    addAnnotationReply(annotationId, 'agent', `Fix failed: ${truncate(message, 240)}`)
    return
  }
  addAnnotationReply(annotationId, 'agent', result.summary)
  if (result.shouldResolve) {
    updateAnnotationStatus(annotationId, 'resolved', 'Auto-resolved by agent', 'agent')
  }
}

