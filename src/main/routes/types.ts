import type { IncomingMessage, ServerResponse } from 'http'

export interface RouteContext {
  request: IncomingMessage
  response: ServerResponse
  url: string
  body: unknown
  params: Record<string, string>
}

export type RouteHandler = (ctx: RouteContext) => Promise<void>

export interface Route {
  method: string
  pattern: string | RegExp
  handler: RouteHandler
}
