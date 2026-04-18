import type { Route } from './types'
import type { AnnotationStatus } from '../../shared/types'
import {
  addAnnotationReply,
  createAnnotation,
  deleteAnnotation,
  getAnnotationById,
  getAnnotations,
  updateAnnotationStatus,
} from '../workspace-annotations'
import {
  fixAnnotation,
  fixPendingAnnotationsForOrigin,
} from '../agent-fix/fix-orchestrator'
import { writeJson } from '../app-control-server'

export const annotationRoutes: Route[] = [
  {
    method: 'GET',
    pattern: /^\/annotations(\/[^/?]+)?(\?.*)?$/,
    async handler({ response, url }) {
      const searchParams = new URL(url, 'http://localhost').searchParams
      const status = searchParams.get('status') as AnnotationStatus | 'unresolved' | 'all' | null
      const annotationUrl = searchParams.get('url') ?? undefined
      const frameId = searchParams.get('frame_id') ?? undefined
      const id = url.match(/^\/annotations\/([^/?]+)$/)?.[1]
      if (id) {
        const annotation = getAnnotationById(id)
        if (!annotation) {
          writeJson(response, 404, { error: `Annotation not found: ${id}` })
          return
        }
        writeJson(response, 200, annotation)
        return
      }
      writeJson(
        response,
        200,
        {
          annotations: getAnnotations({
            status: status ?? undefined,
            url: annotationUrl,
            frameId,
          }),
        },
      )
    },
  },
  {
    method: 'POST',
    pattern: '/annotations',
    async handler({ response, body }) {
      const payload = body as {
        anchor?: unknown
        author?: 'user' | 'agent'
        text?: string
        kind?: string
        drawing?: unknown
        metadata?: Record<string, unknown>
      }
      if (!payload.anchor || typeof payload.text !== 'string') {
        writeJson(response, 400, { error: 'anchor and text are required' })
        return
      }
      writeJson(
        response,
        200,
        createAnnotation(
          payload as {
            anchor: any
            author?: 'user' | 'agent'
            text: string
            kind?: any
            drawing?: any
            metadata?: Record<string, unknown>
          },
        ),
      )
    },
  },
  {
    method: 'POST',
    pattern: /^\/annotations\/([^/]+)\/acknowledge$/,
    async handler({ response, params }) {
      const id = params[0]
      const result = updateAnnotationStatus(id, 'acknowledged')
      if (!result) {
        writeJson(response, 404, { error: `Annotation not found: ${id}` })
        return
      }
      writeJson(response, 200, result)
    },
  },
  {
    method: 'POST',
    pattern: /^\/annotations\/([^/]+)\/dismiss$/,
    async handler({ response, body, params }) {
      const id = params[0]
      const payload = body as { reason?: string }
      const result = updateAnnotationStatus(id, 'dismissed', payload.reason)
      if (!result) {
        writeJson(response, 404, { error: `Annotation not found: ${id}` })
        return
      }
      writeJson(response, 200, result)
    },
  },
  {
    method: 'POST',
    pattern: /^\/annotations\/([^/]+)\/resolve$/,
    async handler({ response, params }) {
      const id = params[0]
      const result = updateAnnotationStatus(id, 'resolved')
      if (!result) {
        writeJson(response, 404, { error: `Annotation not found: ${id}` })
        return
      }
      writeJson(response, 200, result)
    },
  },
  {
    method: 'POST',
    pattern: /^\/annotations\/([^/]+)\/reply$/,
    async handler({ response, body, params }) {
      const id = params[0]
      const payload = body as { author?: string; text?: string }
      if (!payload.text) {
        writeJson(response, 400, { error: 'text is required' })
        return
      }
      const result = addAnnotationReply(id, (payload.author as 'user' | 'agent') ?? 'agent', payload.text)
      if (!result) {
        writeJson(response, 404, { error: `Annotation not found: ${id}` })
        return
      }
      writeJson(response, 200, result)
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/annotations\/([^/]+)$/,
    async handler({ response, params }) {
      const id = params[0]
      const deleted = deleteAnnotation(id)
      if (!deleted) {
        writeJson(response, 404, { error: `Annotation not found: ${id}` })
        return
      }
      writeJson(response, 200, { ok: true })
    },
  },
  {
    method: 'POST',
    pattern: '/annotations/fix',
    async handler({ response, body }) {
      const payload = body as { origin?: string; annotationId?: string }
      if (payload.annotationId) {
        const ok = fixAnnotation(payload.annotationId)
        writeJson(response, 200, { ok, queued: ok ? 1 : 0 })
        return
      }
      if (payload.origin) {
        const queued = fixPendingAnnotationsForOrigin(payload.origin)
        writeJson(response, 200, { ok: true, queued })
        return
      }
      writeJson(response, 400, { error: 'origin or annotationId is required' })
    },
  },
]
