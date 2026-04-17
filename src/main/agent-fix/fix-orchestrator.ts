import type { Annotation } from '../../shared/types'
import { annotationOrigin, truncate } from '../../shared/annotation-utils'
import {
  addAnnotationReply,
  getAnnotationById,
  getAnnotations,
  setOnAnnotationCreated,
  setOnAnnotationReply,
  updateAnnotationStatus,
} from '../workspace-annotations'
import { getOriginBinding } from '../runtime/preferences'
import { buildFixPrompt } from './prompt-builder'
import { invokeClaude, type FixResult } from './claude-spawner'
import {
  isAnnotationInFlight,
  markFixFinished,
  markFixStarted,
} from './fix-tracker'
import {
  appendFixEvent,
  finalizeFixProgress,
  startFixProgress,
} from './fix-progress'

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
  setOnAnnotationReply((annotation, reply) => {
    if (reply.author !== 'user') return
    if (annotation.status === 'dismissed') return
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
  startFixProgress(annotation.id, origin)
  markFixStarted(annotation.id, origin)
  void runFix(annotation.id, origin, prompt, binding.repoPath)
  return true
}

async function runFix(
  annotationId: string,
  origin: string,
  prompt: string,
  repoPath: string,
): Promise<void> {
  let result: FixResult | null = null
  let error: Error | null = null
  try {
    result = await invokeClaude(prompt, repoPath, {
      onEvent: (event) => appendFixEvent(annotationId, event.kind, event.text),
    })
  } catch (err) {
    error = err instanceof Error ? err : new Error(String(err))
  } finally {
    markFixFinished(annotationId, origin)
  }
  handleCompletion(annotationId, result, error)
}

function handleCompletion(
  annotationId: string,
  result: FixResult | null,
  error: Error | null,
): void {
  if (error || !result) {
    const message = error ? error.message : 'Unknown error from fix runner.'
    const shortMessage = truncate(message, 240)
    appendFixEvent(annotationId, 'error', shortMessage)
    finalizeFixProgress(annotationId, 'failed', { error: shortMessage })
    addAnnotationReply(annotationId, 'agent', `Fix failed: ${shortMessage}`)
    return
  }
  finalizeFixProgress(annotationId, 'completed', {
    summary: result.summary,
    shouldResolve: result.shouldResolve,
  })
  addAnnotationReply(annotationId, 'agent', result.summary)
  if (result.shouldResolve) {
    updateAnnotationStatus(annotationId, 'resolved', 'Auto-resolved by agent', 'agent')
  }
}

