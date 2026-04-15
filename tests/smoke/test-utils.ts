import WebSocket from 'ws'

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitFor<T>(
  factory: () => Promise<T>,
  predicate: (value: T) => boolean,
  message: string,
  { maxAttempts = 20, intervalMs = 100 }: { maxAttempts?: number; intervalMs?: number } = {},
): Promise<T> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const value = await factory()
      if (predicate(value)) return value
    } catch (error) {
      lastError = error
    }
    await wait(intervalMs)
  }
  throw lastError instanceof Error ? lastError : new Error(message)
}

export async function openWebSocket(url: string): Promise<WebSocket> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(url)
        socket.once('open', () => resolve(socket))
        socket.once('error', reject)
      })
    } catch {
      if (attempt === 4) throw new Error(`Failed to connect to ${url} after 5 attempts`)
      await wait(200)
    }
  }
  throw new Error('unreachable')
}

export function closeWebSocket(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    socket.once('close', () => resolve())
    socket.close()
  })
}
