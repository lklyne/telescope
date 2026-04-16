/**
 * Entry point for Claude-powered annotation fixes.
 *
 * - fixAnnotation: one-off fix for a single annotation (stateless, fresh claude -p)
 * - fixPendingAnnotationsForOrigin: batch fix all unresolved annotations for an origin
 * - initFixOrchestrator: registers the auto-fix observer on annotation creation
 */

import type { Annotation } from '../../shared/types'
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
    const origin = originOf(annotation)
    if (!origin) return
    const binding = getOriginBinding(origin)
    if (!binding || !binding.autoFix) return
    fixAnnotation(annotation.id)
  })
}

export function fixAnnotation(annotationId: string): boolean {
  const annotation = getAnnotationById(annotationId)
  if (!annotation) return false
  if (isAnnotationInFlight(annotationId)) return false

  const origin = originOf(annotation)
  if (!origin) {
    addAnnotationReply(annotationId, 'agent', 'Cannot fix: annotation has no associated page URL.')
    return false
  }
  const binding = getOriginBinding(origin)
  if (!binding) {
    addAnnotationReply(annotationId, 'agent', `Cannot fix: no repo linked to ${origin}. Link one in the Comments panel.`)
    return false
  }
  const agentReplies = annotation.replies.filter((r) => r.author === 'agent').length
  if (agentReplies >= MAX_AGENT_REPLIES) {
    addAnnotationReply(annotationId, 'agent', 'Agent reply cap reached. Resolve manually or reopen with a new comment.')
    return false
  }

  const prompt = buildFixPrompt(annotation)
  updateAnnotationStatus(annotationId, 'acknowledged')

  const enqueued = enqueueFix({
    annotationId,
    origin,
    repoPath: binding.repoPath,
    run: () => invokeClaude(prompt, binding.repoPath),
    onComplete: (result, error) => handleCompletion(annotationId, result, error),
  })
  return enqueued
}

export function fixPendingAnnotationsForOrigin(origin: string): number {
  const binding = getOriginBinding(origin)
  if (!binding) return 0
  const candidates = getAnnotations().filter((annotation) => {
    if (annotation.status === 'resolved' || annotation.status === 'dismissed') return false
    return originOf(annotation) === origin
  })
  let queued = 0
  for (const annotation of candidates) {
    if (fixAnnotation(annotation.id)) queued++
  }
  return queued
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

function originOf(annotation: Annotation): string | null {
  const pageUrl = annotation.metadata?.pageUrl
  if (!pageUrl) return null
  try {
    return new URL(pageUrl).origin
  } catch {
    return null
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return value.slice(0, max - 1) + '…'
}
