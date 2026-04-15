import type { WebContents } from 'electron'

export function safeSend(wc: WebContents, channel: string, ...args: unknown[]): void {
  if (wc.isDestroyed()) return
  try {
    wc.send(channel, ...args)
  } catch {
    // Render frame was disposed between the isDestroyed() check and send
    // (navigation, view swap, devtools detach). Safe to drop.
  }
}
