import { Server } from '@modelcontextprotocol/sdk/server/index.js'

// Re-export shared app-client for existing consumers
export {
  sessionId,
  callApp,
  notifySessionState,
  startHeartbeat,
  stopHeartbeat,
} from './shared/app-client'

export function asText(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  }
}

export const server = new Server(
  {
    name: 'specular-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
)
