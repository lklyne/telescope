/**
 * Timing constants for agent presence cursor animation.
 *
 * The cursor follows a move → dwell → act → hold sequence:
 *
 *   1. TRAVEL — CSS transition moves the cursor to the target position.
 *   2. DWELL  — short pause so the user registers the cursor on the target
 *               before the action fires and the page changes.
 *   3. ACT    — the browser action (click, type, etc.) executes.
 *   4. HOLD   — label stays visible so it doesn't flicker away.
 *
 * The intent system gives the server a head start: the shim fires an intent
 * before agent-browser sends the CDP command, so elapsed travel time is
 * subtracted from the pre-action delay. In practice the agent blocks for
 * max(0, STEP_DELAY - elapsed) instead of the full STEP_DELAY.
 */

/** Duration of the CSS cubic-bezier transition that animates the cursor
 *  between positions. This runs on the renderer and never blocks the agent. */
export const PRESENCE_TRAVEL_MS = 250

/** Extra pause after the cursor arrives but before the action fires.
 *  Gives the user a moment to see where the cursor landed. */
export const PRESENCE_DWELL_MS = 50

/** Total pre-action delay: travel + dwell. The CDP proxy sleeps for at most
 *  this long before forwarding a click, minus any time already elapsed since
 *  the intent was received. Also used as the per-step pause during workspace
 *  scan animations. */
export const PRESENCE_STEP_DELAY_MS = PRESENCE_TRAVEL_MS + PRESENCE_DWELL_MS

/** How long to wait after the last tool call before auto-transitioning the
 *  cursor to the "Thinking…" state. Covers the gap while the agent's chain
 *  of thought runs between actions. */
export const PRESENCE_THINKING_DELAY_MS = 3_000

/** Maximum time an intent stays in the pending map before being discarded.
 *  Prevents stale intents from affecting unrelated CDP commands. */
export const PRESENCE_INTENT_TTL_MS = 2_000

