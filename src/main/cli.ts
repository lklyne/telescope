import { setClientName } from './shared/app-client'
import { notifySessionState } from './shared/app-client'
import { dispatch } from './cli-commands'

setClientName('telescope-cli')

async function main(): Promise<void> {
  // Ping the session open — but never close it explicitly.
  // The server's 15s session timeout handles cleanup, and the cursor
  // auto-transitions to "Thinking…" between invocations so it stays
  // visible across a chain of tool calls.
  await notifySessionState('/mcp/session/open')
  try {
    const exitCode = await dispatch(process.argv.slice(2))
    process.exitCode = exitCode
  } catch (error) {
    process.stderr.write(
      `error: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  }
}

function shutdown(exitCode: number): void {
  setTimeout(() => process.exit(exitCode), 50)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

main().catch((error) => {
  process.stderr.write(
    `fatal: ${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exit(1)
})
