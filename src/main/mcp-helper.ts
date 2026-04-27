import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  server,
  notifySessionState,
  startHeartbeat,
  stopHeartbeat,
} from './mcp-server'
import { setClientName } from './shared/app-client'
import { registerTools } from './mcp-tools'

setClientName('specular-mcp')
registerTools(server)

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  await notifySessionState('/mcp/session/open')
  startHeartbeat()
}

function shutdown(exitCode?: number): void {
  stopHeartbeat()
  void notifySessionState('/mcp/session/close')
  if (typeof exitCode === 'number') {
    setTimeout(() => process.exit(exitCode), 50)
  }
}

process.on('exit', () => {
  stopHeartbeat()
})
process.on('SIGINT', () => {
  shutdown(0)
})
process.on('SIGTERM', () => {
  shutdown(0)
})

main().catch((error) => {
  console.error(error)
  shutdown(1)
})
