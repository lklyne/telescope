# CLI Architecture Review: MCP vs CLI-First

## Executive Summary

The current unified MCP approach sends ~5,160 tokens of tool schemas on every
session initialization—29 tools, always, unconditionally. The old dual CLI
(`agent-canvas/`) was ~1,256 lines of plain JS that talked to the same HTTP
control server but exposed operations as shell commands. Both approaches share
the same foundation: the Electron app's HTTP control server on localhost.

This document analyzes the tradeoffs and sketches a future-focused CLI-first
approach that could replace the MCP layer while preserving all capabilities.

---

## Architecture Timeline

### Phase 1: MCP Foundation (Mar 3)

PR #4 established the MCP-first architecture: a bundled stdio MCP helper
(`mcp-helper.ts`) forwarding tool calls to a loopback HTTP control server in
the Electron main process. Tools: workspace inspection, frame placement, task
layout, linking, focus, deletion.

PRs #5, #18, #20 expanded the tool surface—snapshot, screenshot,
query_elements. PR #42 added text entity CRUD (4 tools). PR #44 added file
entity CRUD (4 more tools). Each entity type got its own set of tools,
beginning the proliferation pattern.

### Phase 2: Dual-Surface CLI (Mar 25–26, ~6 days)

PR #72 (`poc/agent-canvas-cli`) introduced `agent-canvas` CLI alongside MCP as
a proof of concept for "dual-surface" agent control—separating canvas ops from
in-frame browser interaction. PR #75 refined it with persistent CDP proxy and
presence lifecycle.

The CLI validated the dual-surface model but duplicated the same HTTP API calls
with different argument parsing.

### Phase 3: CLI Removed, MCP Absorbs Everything (Apr 1)

Commit `4449ec5` deleted `agent-canvas/` after ~6 days: "the MCP helper in
mcp-helper.ts supersedes it entirely." 1,312 lines removed. The dual-surface
capabilities (CDP proxy, presence) were retained but accessed through MCP.

### Phase 4: Tool Consolidation (Apr 7)

PR #103 recognized the opposite problem—too many fine-grained tools. Replaced
7+ per-entity CRUD tools (`create_frames`, `create/update/delete_text_entity`,
`create/update/delete_file_entity`, `delete_frames`) with unified
`upsert_entities`.

### Phase 5: Module Decomposition (Apr 4–8)

PR #95 split `mcp-helper.ts` (1,739 lines) into server/tools/entry. PR #107
extracted `mcp-tool-schemas.ts` and `mcp-browse.ts`. The monolith became
well-factored modules, but the fundamental architecture remained unified MCP.

### Key Insight

MCP was the day-one choice and the CLI was a 6-day experiment. But the
experiment wasn't wrong—it validated that the HTTP control server is the stable
foundation, and that canvas and browser interaction are distinct concerns. The
CLI was removed because it duplicated the MCP surface, not because CLI was the
wrong interface for agents.

---

## Current Unified MCP: What Works, What Doesn't

### Strengths

1. **Single entry point.** One `pnpm mcp` / `mcp-helper.js` process handles
   everything. No shim binary on PATH, no separate CLI to install.

2. **Rich return types.** MCP content blocks can return images (base64 PNG from
   screenshots), structured JSON, and multi-part responses. A CLI would print
   text to stdout and write images to files.

3. **Session lifecycle is built in.** Heartbeat, session open/close, presence
   animation—all wired into the MCP server's transport lifecycle.

4. **Tool discovery.** Claude sees all capabilities at once via
   `ListToolsRequest`. No need for `--help` parsing or manual tool enumeration.

### Weaknesses

1. **Context cost is high and fixed.** 29 tools × verbose schemas = ~5,160
   tokens loaded on every conversation, whether the agent needs recording tools,
   annotation tools, or just wants to browse a frame. There is no dynamic
   filtering—`ListToolsRequestSchema` returns the full `toolSchemas` array
   unconditionally (`mcp-tools.ts:19-21`).

2. **Tool descriptions carry inline documentation.** The `browse` tool
   description is 1,346 chars (~385 tokens) of command examples. The
   `upsert_entities` description embeds a 9-device preset table. This
   documentation belongs in a reference, not in every tool listing.

3. **Annotation tools are over-decomposed.** 7 separate tools for what is
   essentially CRUD + state transitions on a single resource:
   `create_annotation`, `get_annotations`, `get_annotation_detail`,
   `acknowledge_annotation`, `resolve_annotation`, `dismiss_annotation`,
   `reply_to_annotation`. These could be 2–3 tools.

4. **The browse tool is an awkward wrapper.** `mcp-browse.ts` (389 lines)
   re-parses shell-style command strings, manages frame locks, spawns
   `agent-browser` as a child process, and handles image encoding. It's
   essentially a CLI inside an MCP tool—the command string `"snapshot -i &&
   click @e3 && get url"` is passed as a single string parameter.

5. **MCP protocol overhead.** JSON-RPC framing over stdio, heartbeat pings every
   5 seconds, session state management. The `mcp-server.ts` module exists solely
   to bridge between MCP protocol conventions and HTTP `callApp()` calls.

6. **Claude Code compatibility tax.** When Claude Code invokes an MCP tool, the
   full tool schema is part of the context window. A CLI tool call via Bash is
   just the command string—the "schema" is whatever Claude knows from a compact
   system prompt or help text it can read on demand.

---

## Old Dual CLI (`agent-canvas/`): What It Got Right

The removed `agent-canvas/` directory (618 + 237 + 243 + 25 + 133 = 1,256
lines) was a standalone Node.js CLI:

```
agent-canvas workspace
agent-canvas frame list
agent-canvas frame create <url> [--preset <index>] [--at <x,y>]
agent-canvas frame delete <id>
agent-canvas frame attach <id>        # returns CDP WebSocket URL
agent-canvas frame snapshot <id>
agent-canvas frame screenshot <id> [output.png]
agent-canvas note create <text> [--at <x,y>]
agent-canvas file create <path> [--at <x,y>]
agent-canvas delete <id> [id...]
agent-canvas record start|stop|status|trim
```

Plus an `agent-browser-shim` that wrapped the real `agent-browser` binary to
fire presence intents before forwarding execution.

### What worked

- **Minimal context.** The agent needed only a system prompt description of the
  commands—no JSON schemas in the context window.
- **Composable.** `agent-canvas frame attach <id>` returns a CDP URL, which you
  pipe into `agent-browser --cdp <url> snapshot`. Standard Unix composition.
- **Transparent.** Bash tool calls are visible, auditable, retryable. The
  command is the interface.
- **Lightweight.** Plain `.mjs` files, no build step, no SDK dependency.

### What didn't work

- **Two surfaces to maintain.** The CLI and MCP tools duplicated the same HTTP
  calls with different argument parsing.
- **No rich returns.** Screenshots went to files; the agent had to read them
  separately. MCP can return inline base64 images.
- **The shim was fragile.** `agent-browser-shim` had to intercept a binary on
  PATH, find the "real" binary, fire-and-forget presence calls. Error handling
  was best-effort.
- **No session management.** The CLI created a session file but had no heartbeat
  or lifecycle management.

---

## Analysis: CLI-First for Claude Code

The key insight is that **Claude Code's primary tool interface is Bash**, not
MCP. When Claude Code calls an MCP tool, the tool schema inflates the context.
When it calls a CLI via Bash, the "schema" is just whatever Claude was told in
the system prompt—and it can read `--help` on demand.

### Context comparison

| Approach | Per-session context cost | Per-invocation cost |
|----------|------------------------|---------------------|
| MCP (current) | ~5,160 tokens (all 29 tool schemas) | Tool name + args |
| CLI-first | ~500-800 tokens (system prompt summary) | Command string |
| CLI + on-demand help | ~200 tokens (just "use `telescope` CLI") | Command string + optional `--help` read |

A CLI-first approach could reduce context by **6-25x**.

### The unified CLI: one binary, flat verbs

The core design insight is that `mcp-browse.ts` is already a CLI orchestrating
agent-browser—it's just trapped inside an MCP tool. The `browse` tool takes a
shell command string (`"snapshot -i && click @e3"`), re-parses it, resolves the
frame, gets the CDP URL, spawns agent-browser, handles presence, manages frame
locks, encodes images. It's a command-string-within-a-command.

A clean CLI **promotes browser verbs to first-class commands** alongside canvas
verbs. The agent doesn't think about two tools—it just uses `telescope`:

```
# Browser verbs — resolve frame, spawn agent-browser transparently
telescope snapshot                     # accessibility tree of selected frame
telescope snapshot -i                  # with interactive element refs
telescope snapshot -s "#main"          # scoped to CSS selector
telescope click @e5                    # click element
telescope fill @e12 "hello world"     # fill input
telescope type @e12 "hello world"     # type into element
telescope select @e8 "option-value"   # select dropdown
telescope scroll down                  # scroll page
telescope wait --load networkidle     # wait for page settle
telescope get text                     # read page content
telescope get url                      # read current URL
telescope screenshot                   # capture PNG, print path
telescope screenshot --annotate        # labeled screenshot with refs
telescope console                      # page diagnostics
telescope errors                       # page errors

# Canvas verbs — HTTP to control server
telescope workspace                    # JSON workspace graph
telescope selection                    # current selection

# Create entities
telescope create frame <url>                      # default preset (iPhone 14 Pro)
telescope create frame <url> --preset 7            # Desktop (1440×900)
telescope create frame <url> --preset 0 --landscape  # iPhone SE landscape
telescope create frame <url> --at 500,200          # explicit canvas position
telescope create frame <url> --group grp_abc       # add to existing group
telescope create note "text"                       # create sticky note
telescope create note "text" --color red           # colored note
telescope create file /path/to/image.png           # file attachment

# Update entities (move, resize, change breakpoint)
telescope update <id> --preset 8                   # switch to Desktop XL (1920×1080)
telescope update <id> --preset 3 --landscape       # iPad Mini landscape
telescope update <id> --at 800,400                 # move to canvas position
telescope update <id> --url https://new-url.com    # navigate to different URL
telescope update <id> --text "new content"         # update note text
telescope update <id> --color purple               # change note color

# Batch upsert (create and update mixed, JSON on stdin)
echo '[{"kind":"frame","url":"https://a.com","presetIndex":1},
      {"kind":"frame","id":"frame_abc","presetIndex":7,"canvasX":800}]' \
  | telescope upsert

telescope delete <id> [id...]          # delete any entity
telescope group <id> [id...]           # group entities
telescope ungroup <group-id>           # ungroup
telescope link <from> <to>             # create edge
telescope focus [--frame <id>] [--group <id>]

# Annotation verbs
telescope annotate <text> [--on <anchor>]
telescope annotations [--status pending]
telescope annotation <id> [--ack|--resolve|--dismiss|--reply "text"]

# Specialized
telescope record start|stop|status|trim
telescope layout breakpoints <url>
telescope layout components <component> <url> --vary <props>
```

**Frame context** is implicit (selected frame) or explicit (`-f <frame-id>`):

```
telescope snapshot                     # selected frame
telescope -f frame_abc123 snapshot     # explicit frame
telescope -f frame_abc123 click @e5    # explicit frame
```

**Chaining** works with `&&`, just like `mcp-browse.ts` supports today:

```
telescope snapshot -i && telescope click @e3 && telescope get url
```

Or as a single command to preserve element refs across the chain:

```
telescope chain "snapshot -i && click @e3 && get url"
```

### How it works internally

The CLI classifies each verb into one of two dispatch paths:

```
BROWSER_VERBS = {snapshot, click, fill, type, select, scroll,
                 wait, get, screenshot, console, errors,
                 query-elements, find, diff, chain}

if verb in BROWSER_VERBS:
  1. Resolve frame (selected or -f flag)
  2. GET /frames/{id}/cdp-target → CDP WebSocket URL
  3. POST /session/presence/intent (fire-and-forget)
  4. spawn agent-browser --cdp <url> <verb> <args>
  5. Handle output (screenshot → temp file path, snapshot → stdout)
  6. POST /session/presence {eventType: 'done'}

elif verb == 'create':
  Parse kind (frame/note/file) and flags (--preset, --at, --landscape, etc.)
  For frames:
    1. Resolve device from --preset (deviceForPresetIndex)
    2. Resolve orientation (--landscape/--portrait, default per device)
    3. Find placement if --at not given (POST /layout/find-placement)
    4. POST /frames/create with device metadata
  For notes: POST /text-entities/create
  For files: POST /file-entities/create

elif verb == 'update':
  Parse <id> and flags
  Detect entity kind from id prefix (frame_/text_/file_)
  For frames: POST /frames/update {frames: [{id, presetIndex?, orientation?, canvasX?, canvasY?, url?}]}
  For notes:  POST /text-entities/update {items: [{id, patch: {text?, color?, canvasX?, canvasY?}}]}
  For files:  POST /file-entities/update {items: [{id, patch: {canvasX?, canvasY?}}]}

elif verb == 'upsert':
  Read JSON array from stdin (same schema as MCP upsert_entities items)
  Group by kind × create/update (id present = update)
  Fire all independent HTTP calls concurrently (same as mcp-tools.ts:103-153)

else:
  Map verb+args to HTTP route + body
  POST/GET to control server
  Print JSON to stdout
```

This is exactly what `mcp-browse.ts` + `mcp-tools.ts` do today, but without
the MCP protocol wrapper.

### Entity operations: what's supported

The `/frames/update` route (`routes/frames.ts:97-133`) handles all frame
mutation fields:

| Flag | Route field | Effect |
|------|------------|--------|
| `--preset <0-8>` | `presetIndex` | Changes device size (calls `setFramePreset`) |
| `--landscape` / `--portrait` | `orientation` | Swaps width/height (calls `setDeviceOrientation`) |
| `--at <x>,<y>` | `canvasX`, `canvasY` | Moves frame on canvas |
| `--url <url>` | `url` | Navigates to new URL |
| `--device-frame` / `--no-device-frame` | `showDeviceFrame` | Toggle device bezel |

Device presets map to real devices:

```
--preset 0  iPhone SE         375×667    --preset 5  iPad Pro 12.9  1024×1366
--preset 1  iPhone 14 Pro     393×852    --preset 6  Laptop         1280×800
--preset 2  iPhone 14 Pro Max 430×932    --preset 7  Desktop        1440×900
--preset 3  iPad Mini         744×1133   --preset 8  Desktop XL     1920×1080
--preset 4  iPad Pro 11       834×1194
```

Dimensions are portrait by default for phones/tablets. `--landscape` swaps.

The `telescope upsert` command (stdin JSON) preserves full batch semantics
from the MCP tool — mixed creates and updates across entity types, all fired
concurrently. This is the power-user path for agents doing complex canvas
manipulation in one call.

### Key design principles

1. **Flat verb namespace.** `telescope snapshot`, not `telescope browse
   "snapshot"`. The agent writes one command, not a command-within-a-command.
   Agent-browser is an implementation detail.

2. **JSON output by default.** Every command returns JSON to stdout. Claude
   parses it naturally. Snapshots return the accessibility tree text (same as
   agent-browser outputs today).

3. **Screenshots to temp files.** `telescope screenshot` writes to a temp
   file and prints the path. Claude Code reads the file with its Read tool.
   `telescope screenshot --base64` outputs base64 to stdout for piping.

4. **Session via environment.** `TELESCOPE_SESSION_ID` env var, set once in
   a startup hook or system prompt. No heartbeat needed—the control server
   can use a simpler presence model (last-seen timestamp, activity-based).

5. **Presence is transparent.** Every browser verb fires presence intent
   before spawning agent-browser. Canvas verbs emit presence for operations
   with spatial targets (create, delete, focus). No separate shim binary.

6. **System prompt is the schema.** ~400 tokens instead of ~5,160:

   ```
   Use `telescope` to interact with the canvas and frames.

   Browser (operates on selected frame, or use -f <id>):
     telescope snapshot -i          # accessibility tree with refs
     telescope click @e5            # click element
     telescope fill @e12 "text"     # fill input
     telescope screenshot           # capture PNG (prints path)
     telescope get text|url         # read page content
     telescope scroll down|up       # scroll page

   Canvas:
     telescope workspace            # full workspace graph
     telescope create frame <url>   # create frame (returns ID)
     telescope create note "text"   # create note
     telescope delete <id>          # delete entity
     telescope annotations          # list feedback
     telescope annotation <id> --resolve

   Run `telescope --help` for full reference.
   ```

### What you gain

| Dimension | MCP (current) | CLI-first |
|-----------|--------------|-----------|
| Context tokens | ~5,160 | ~500 |
| Build complexity | esbuild bundle + MCP SDK | Single TS → JS binary |
| Protocol overhead | JSON-RPC stdio, heartbeat | HTTP to control server |
| Image returns | Inline base64 in MCP content | File path or base64 to stdout |
| Composability | Tool calls only | Pipeable, chainable |
| Debuggability | MCP inspector needed | Run commands in terminal |
| Session management | Built into MCP transport | Env var + control server |
| Works without Claude | No (MCP client required) | Yes (any terminal) |

### What you lose

1. **Inline image content.** MCP returns base64 images directly in the response.
   The CLI writes to a temp file and prints the path—two steps for Claude Code
   (run command, read file). In practice this is fine: `telescope screenshot`
   prints `/tmp/telescope-shot-1712345.png`, Claude Code reads it. The `--base64`
   flag outputs directly to stdout for single-step piping if needed.

2. **Structured error handling.** MCP has `isError` content blocks. CLI uses
   exit codes + stderr. Claude Code handles both fine.

3. **Protocol-level discovery.** MCP clients auto-discover tools. But Claude
   Code uses system prompts, not MCP discovery. The `--help` flag serves the
   same purpose on demand.

---

## Presence Validation: CLI Preserves Full Cursor/Animation Fidelity

The presence system has a critical design property: **nothing in the animation
pipeline depends on MCP**. Every presence event flows through HTTP POST calls
to the control server. The MCP layer is just a caller—the CLI can make the
exact same calls with zero changes to the server.

### How presence works today (the non-blocking pipeline)

```
                    CLI / MCP process                    Telescope app (Electron)
                    ─────────────────                    ────────────────────────
1. Intent fires ──► POST /session/presence/intent ──► Server stores pending intent
   (fire-and-forget,                                   Sets cursor → 'traveling'
    never awaited)                                     Starts CSS transition (250ms)
                                                       Intent expires after 2s (TTL)

2. CDP resolves ──► GET /frames/{id}/cdp-target ──►  Returns WebSocket URL
                                                       Saves selection snapshot
                                                       beginAutomationInteractiveFrame()

3. agent-browser    [spawned with --cdp <url>]         CDP proxy handles messages
   runs commands    No presence calls during            Cursor animates on renderer
                    execution — agent is free            via React (AgentCursorLayer)

4. Done fires ────► POST /session/presence            Server clears cursor
   (fire-and-forget, {eventType: 'done'}               endAutomationInteractiveFrame()
    in finally{})                                       restoreAutomationSelection()
                                                       Schedules 'thinking' after 3s
```

### The one intentional delay: CDP proxy click dwell

There *is* one place the presence system introduces a real delay — but it's
inside the **CDP proxy on the server**, not in the CLI/MCP process. When
agent-browser sends a `mousePressed` CDP event, the proxy sleeps for
`max(0, STEP_DELAY_MS - elapsed)` before forwarding the click
(`app-control-server.ts:527-538`):

```typescript
if (cdpType === 'mousePressed') {
  const intent = pendingIntents.get(registration.sessionId)
  const elapsed = intent ? Date.now() - intent.receivedAt : 0
  const remaining = Math.max(0, PRESENCE_CURSOR_STEP_DELAY_MS - elapsed)
  if (remaining > 0) await sleep(remaining)     // ← holds the CDP message
}
```

This is the mechanism that makes clicks "feel natural" — the cursor has time
to travel to the target before the click lands. The delay is at most 300ms
(travel 250ms + dwell 50ms) and is usually much less because the intent was
fired ~100-200ms earlier. The agent-browser process blocks waiting for the CDP
response, but the CLI process already returned from fire-and-forget intent and
is just waiting for agent-browser's stdout.

**This works identically with a CLI.** The intent comes in via HTTP POST, the
pending intent is stored by sessionId, and the CDP proxy consumes it when the
click arrives. The proxy doesn't know who sent the intent.

### Timing constants (presence-timing.ts)

| Constant | Value | Purpose | Blocks agent? |
|----------|-------|---------|---------------|
| `PRESENCE_TRAVEL_MS` | 250ms | CSS transition for cursor movement | No (renderer) |
| `PRESENCE_DWELL_MS` | 50ms | Pause after cursor arrives | No (renderer) |
| `PRESENCE_STEP_DELAY_MS` | 300ms | Travel + dwell, CDP click hold | CDP only (server) |
| `PRESENCE_THINKING_DELAY_MS` | 3,000ms | Auto-transition to "Thinking…" | No (server timer) |
| `PRESENCE_INTENT_TTL_MS` | 2,000ms | Stale intent expiry | No (server timer) |
| `PRESENCE_LABEL_HOLD_MS` | 600ms | Minimum label visibility | No (renderer) |

**Key insight: nothing in the timing model blocks the agent process.** The
intent fires before agent-browser spawns. The cursor transition runs on the
renderer's CSS animation thread. The 'done' event fires in a finally block
after agent-browser exits. The agent never waits for animations.

### What the CLI must do (and nothing more)

For browser verbs (`snapshot`, `click`, `fill`, etc.):

```typescript
// 1. Fire intent — fire-and-forget, identical to mcp-browse.ts:220-234
callApp('/session/presence/intent', {
  method: 'POST',
  body: JSON.stringify({
    sessionId,                    // from env var TELESCOPE_SESSION_ID
    clientName: 'telescope-cli',
    command: verb,
    labelKey,                     // from COMMAND_LABELS map
    labelHint,
    targetRef: ref,               // @eN from args
    targetRefSource: ref ? 'agent-browser' : null,
  }),
}).catch(() => {})                // never await

// 2. Resolve CDP URL
const cdpUrl = await callApp(`/frames/${frameId}/cdp-target`)
//   → server snapshots selection, begins automation overlay

// 3. Spawn agent-browser (blocks until complete)
const result = await spawnAsync(agentBrowser, ['--cdp', cdpUrl, ...argv])

// 4. Clear presence — fire-and-forget, in finally block
callApp('/session/presence', {
  method: 'POST',
  body: JSON.stringify({ sessionId, clientName: 'telescope-cli', eventType: 'done' }),
}).catch(() => {})
//   → server clears cursor, restores selection, ends automation overlay
```

This is **identical** to what `mcp-browse.ts` does today. The presence system
doesn't know or care whether the caller is MCP or CLI.

For canvas verbs (`create`, `delete`, `group`):

```typescript
// Animated cursor scanning — handled by the server, not the CLI
// POST /frames/create or /entities/delete triggers staggerOperation()
// which animates the cursor across targets automatically (presence-cursor.ts:454-478)
callApp('/frames/create', { method: 'POST', body: ... })
// Server calls staggerOperation() internally → cursor animates over entities
```

Canvas operations that involve spatial targets (batch creates, batch deletes)
already run `staggerOperation()` on the server side (`presence-cursor.ts:454`).
The animation is server-initiated, not caller-initiated. The CLI gets this
for free.

### Session lifecycle: simpler without heartbeats

The MCP approach uses session open → 5-second heartbeat → session close. The
CLI can use a simpler model:

**Option A: Activity-based sessions (recommended)**

```typescript
// Set TELESCOPE_SESSION_ID once in a startup hook or .claude/hooks.json
// Every CLI call sends x-telescope-session-id header automatically
// resolveSession() in presence-session.ts already creates sessions on first contact
// Sessions expire after MCP_SESSION_TIMEOUT_MS (15s) of inactivity
// No heartbeat needed — each CLI call is a "ping" via the header
```

This works because `resolveSession()` (`presence-session.ts:28-60`) already
handles session auto-creation from the `x-telescope-session-id` header. Every
HTTP call the CLI makes implicitly keeps the session alive.

**The departing animation** (`routes/session.ts:288-315`) fires when a session
is explicitly closed. The CLI can fire this once at the end of a Claude Code
session (via a shutdown hook), or the server can infer it from the 15-second
timeout.

**Option B: Explicit open/close (if needed)**

```bash
# In a Claude Code startup hook:
telescope session open

# In a shutdown hook:
telescope session close
```

These map to `POST /mcp/session/open` and `POST /mcp/session/close`. The
routes aren't MCP-specific despite the URL path—they just register/deregister
a session ID.

### Frame selection and highlighting

When agent-browser connects via CDP proxy (`app-control-server.ts:309-312`):

1. **Selection snapshot** — server saves current UI selection
2. **`beginAutomationInteractiveFrame(frameId)`** — highlights the frame,
   shows automation overlay
3. Agent-browser runs commands
4. **`endAutomationInteractiveFrame(frameId)`** — removes highlight
5. **`restoreAutomationSelectionIfNeeded()`** — restores prior selection

This happens in the CDP proxy's WebSocket upgrade handler, triggered when
agent-browser opens its CDP connection. The CLI doesn't need to do anything—
the server handles it automatically when agent-browser connects through the
proxy.

### What changes vs MCP: nothing on the server

| Component | Changes needed? | Why |
|-----------|----------------|-----|
| `routes/session.ts` | None | Accepts any sessionId via header/body |
| `presence-cursor.ts` | None | Manages state based on HTTP calls |
| `presence-session.ts` | None | Auto-creates sessions from headers |
| `cdp-proxy.ts` | None | Triggered by agent-browser, not caller |
| `presence-timing.ts` | None | Constants used by server/renderer |
| `AgentCursorLayer.tsx` | None | Renders from cursor state |
| `app-control-server.ts` | None | CDP upgrade independent of caller |
| `overlay-manager.ts` | None | Frame highlighting is server-side |

**Zero server changes.** The CLI is a new caller making the same HTTP calls.
The presence system, cursor animation, frame selection, and departing
animation all work identically.

### Comparison to old agent-canvas CLI

The old CLI (PR #72) got presence right. Its `agent-browser-shim` fired
intents before spawning the real binary, the same pattern as `mcp-browse.ts`.
The main things it lacked:

1. **Session lifecycle** — used a static `'agent-canvas'` session ID with no
   heartbeat or cleanup. Fixed: use UUID from env var + activity-based expiry.

2. **Frame locks** — the old CLI had no per-frame serialization. Two concurrent
   agent-browser invocations on the same frame could race. Fixed: add
   `withFrameLock()` in the CLI (same as `mcp-browse.ts:107-113`).

3. **Departing animation** — the old CLI never sent session close. Fixed:
   send `POST /mcp/session/close` in a shutdown hook.

All three are straightforward to add to the new CLI.

---

## How Tools Are Explained to Agents Today

The agent never sees `mcp-tool-schemas.ts` directly. Tools are explained
through **three layers**, each loaded at different times:

### Layer 1: MCP tool schemas (~5,160 tokens, always loaded)

The 29 tool schemas from `mcp-tool-schemas.ts` are loaded into context
whenever the MCP server connects. This is the "always-on" cost — descriptions,
parameter schemas, enums — whether the agent needs them or not.

### Layer 2: Skill files (loaded on demand)

`.agents/skills/telescope/SKILL.md` is the primary reference the agent sees
when the `telescope` skill activates. It's 111 lines describing:
- The two-surface model (canvas tools vs `browse` tool)
- Common `browse` commands (table format)
- Command chaining with `&&`
- Ref lifecycle, mutation auto-URL, re-snapshot rules
- Default workflow (7 steps)
- Presence, serialization, recording guardrails
- Example session

`.agents/skills/agent-browser/SKILL.md` is the standalone agent-browser
reference (687 lines). It's comprehensive: navigation, snapshot, interactions,
authentication (5 strategies), security, sessions, iframes, eval, diffing,
semantic locators, annotated screenshots, iOS simulator, Lightpanda engine.

The telescope skill's "Telescope Note" section in the agent-browser SKILL.md
redirects agents to use the `browse` MCP tool instead of running agent-browser
directly.

### Layer 3: Reference docs (read on demand)

`.agents/skills/agent-browser/references/` contains deep-dive docs:
`commands.md` (full reference), `snapshot-refs.md`, `session-management.md`,
`authentication.md`, `video-recording.md`, `profiling.md`, `proxy-support.md`.
These are only read when the agent needs specific detail.

### What agent-browser gets right

Agent-browser's SKILL.md is a **masterclass in CLI documentation for agents**.
Key patterns worth adopting:

1. **Core workflow up front.** The first thing the agent sees is the 4-step
   pattern: Navigate → Snapshot → Interact → Re-snapshot. Not a tool list.

2. **Command tables, not JSON schemas.** A table of `command | purpose` pairs
   is ~5x more compact than JSON Schema definitions for the same information.

3. **Tiered documentation.** SKILL.md covers 80% of use cases. `references/`
   covers the remaining 20%. The agent reads deeper docs only when needed.

4. **Patterns, not parameters.** The skill explains *how to do things* (form
   submission, authentication, data extraction) rather than listing every
   flag. Agents learn by example.

5. **Security and guardrails inline.** Content boundaries, domain allowlists,
   action policies — documented where agents will find them, not buried.

6. **Commands the telescope `browse` tool doesn't expose.** The agent-browser
   CLI supports `check`, `uncheck`, `press`, `keyboard`, `hover`, `drag`,
   `upload`, `dblclick`, `focus`, `scrollintoview`, `get html`, `get value`,
   `get attr`, `get count`, `get box`, `get styles`, `is visible`,
   `is enabled`, `is checked`, `eval`, `find` (semantic locators), `frame`,
   `pdf`, `back`, `forward`, `reload`, `highlight`, `download`, `network`,
   `diff screenshot`, `diff url`, `set viewport`, `set device`. Many of these
   work through the `browse` tool today (since it passes the raw command
   string to agent-browser), but they're not documented in the telescope
   skill — agents don't know they can use them.

### What the telescope CLI skill should look like

With a flat-verb CLI, the skill becomes simpler and more like agent-browser's
own documentation:

```markdown
# Telescope

All canvas and frame operations go through the `telescope` CLI.

## Core workflow

1. `telescope workspace` — see what's on the canvas
2. `telescope snapshot -i` — get element refs for the selected frame
3. `telescope click @e5` / `telescope fill @e3 "text"` — interact
4. `telescope snapshot -i` — re-snapshot after mutations (refs go stale)

## Browser commands (selected frame, or use -f <id>)

| Command | Purpose |
|---------|---------|
| `telescope snapshot -i` | Accessibility tree with interactive refs |
| `telescope click @e5` | Click element |
| `telescope fill @e3 "text"` | Clear + type into input |
| `telescope type @e3 "text"` | Type without clearing |
| `telescope select @e3 "value"` | Select dropdown option |
| `telescope scroll down` | Scroll page |
| `telescope screenshot` | Capture PNG (prints file path) |
| `telescope screenshot --annotate` | Labeled screenshot with ref overlay |
| `telescope get text` / `telescope get url` | Read page content |
| `telescope wait --load networkidle` | Wait for page to settle |
| `telescope diff snapshot` | Show changes since last snapshot |
| `telescope find text "Sign In" click` | Semantic locator |
| `telescope eval 'document.title'` | Run JS in page context |

All agent-browser commands work — `telescope` is a thin wrapper.
Run `telescope --help` for the full list.

## Canvas commands

| Command | Purpose |
|---------|---------|
| `telescope workspace` | Full workspace graph (JSON) |
| `telescope create frame <url>` | Create frame (returns ID) |
| `telescope create frame <url> --preset 7` | Desktop 1440×900 |
| `telescope update <id> --preset 0 --landscape` | Change breakpoint |
| `telescope update <id> --at 800,400` | Move on canvas |
| `telescope delete <id>` | Delete entity |
| `telescope create note "text"` | Sticky note |
| `telescope group <id> <id>` | Group entities |

## Annotations

| Command | Purpose |
|---------|---------|
| `telescope annotations` | List all |
| `telescope annotations --status pending` | Filter by status |
| `telescope annotation <id> --resolve` | Mark resolved |
| `telescope annotation <id> --reply "text"` | Reply to thread |

## Key rules

- Re-snapshot after any mutation — refs are per-snapshot
- Mutations auto-print the current URL
- One frame at a time (per-frame serialization)
- Presence animation is automatic
```

This is ~350 tokens loaded on demand vs ~5,160 tokens always in context.
And it covers more commands because agent-browser's full vocabulary is
available through the flat-verb passthrough.

---

## Skill Organization: Two Skills, Layered by Scope

### Recommendation: Keep both `telescope` and `agent-browser` as separate skills

**`telescope` skill** (~350-400 tokens) — the orchestration layer:
- Flat-verb command table: canvas verbs + browser passthrough note
- Two-surface mental model (canvas vs. frame)
- Session lifecycle (auto-managed, no agent action needed)
- Default workflow template (7 steps)
- One key line: "All agent-browser commands work directly via `telescope`"

**`agent-browser` skill** (existing 687 lines) — the browser automation reference:
- Already excellent standalone documentation
- Core workflow, command chaining, auth strategies, ~30 commands
- Tiered references in `references/` for deep dives
- Shared primitive — other tools besides Telescope consume it

### Why two skills, not one?

1. **Context efficiency.** The telescope skill loads first (~350 tokens). Most
   tasks only need canvas operations (create frames, check workspace, manage
   annotations). The agent-browser skill loads on demand only when browser
   automation begins. Merging them forces ~700+ lines into every session.

2. **Agent-browser is a shared primitive.** Other tools and workflows use
   agent-browser outside of Telescope. Folding its documentation into a
   telescope-only skill breaks reuse. The existing skill file is already
   consumed by non-Telescope contexts.

3. **Tiered depth matches agent behavior.** Agents read the telescope skill,
   plan their approach, then pull in agent-browser details only for the browser
   phase. This mirrors how agent-browser.dev structures their own docs —
   workflow first, command reference second.

4. **Maintenance boundary.** Browser commands change with agent-browser
   releases. Canvas commands change with Telescope releases. Separate files
   mean separate update cadences with no merge conflicts.

### How loading works in practice

```
Agent receives task
  → Claude Code loads telescope SKILL.md (~350 tokens)
  → Agent plans approach

  Canvas-only task:
  → telescope skill is sufficient
  → Total context cost: ~350 tokens

  Browser task:
  → Agent requests agent-browser skill (on demand)
  → agent-browser SKILL.md loads (~687 lines)
  → References available if needed (auth, sessions, etc.)
  → Total context cost: ~1,050 tokens (still 5× less than MCP schemas)
```

### What changes in each skill file

**telescope SKILL.md** — rewrite for CLI:
- Replace MCP tool references with CLI command tables
- Remove `browse` tool indirection ("use `telescope snapshot`" not "`browse` tool")
- Add canvas verbs that were previously spread across 29 MCP tools
- Add: "For full browser command reference, see the agent-browser skill"

**agent-browser SKILL.md** — minimal edit:
- Flip the "Telescope Note" from "use the `browse` MCP tool" to "all commands
  work via `telescope <command>` directly — do not run agent-browser separately"
- Everything else stays the same — it's already well-structured

**No new skill file needed.** The documentation that exists today covers both
layers. The reorganization is about making the telescope skill CLI-native and
keeping the agent-browser skill as the shared browser reference it already is.

### Comparison with current MCP approach

| Metric | MCP (current) | Two skills (proposed) |
|--------|--------------|----------------------|
| Always-on context | ~5,160 tokens | ~350 tokens |
| Browser phase context | +0 (already loaded) | +687 lines (~700 tokens) |
| Total for full session | ~5,160 tokens | ~1,050 tokens |
| Canvas-only session | ~5,160 tokens | ~350 tokens |
| Agent-browser commands visible | ~12 (browse tool docs) | ~30+ (full skill) |
| Update cadence | Coupled (one MCP) | Independent (two files) |
| Reusable outside Telescope | No (MCP-specific) | Yes (agent-browser is shared) |

---

## Hybrid Option: CLI + Thin MCP Adapter

- CLI for Claude Code (low context, composable)
- MCP for other clients that need it (Cursor, Windsurf, etc.)
- Single source of truth for behavior (the CLI)
- MCP adapter is mechanical translation, not business logic

The adapter would be ~100 lines: map tool name → CLI command, parse JSON
output → MCP content blocks, handle image files → base64 content.

**The skill file replaces the MCP schema as the documentation layer.** The
agent never needed JSON schemas — it needed a workflow guide and a command
reference. The skill system already provides this on demand.

---

## Incremental Migration Path

1. **Build `telescope` CLI** alongside the existing MCP. Ship it as a single
   bundled JS file. Test it manually and with Claude Code.

2. **Slim the MCP schemas.** Regardless of CLI direction, consolidate
   annotation tools (7→3), move device preset table out of descriptions, trim
   browse command examples. This is a quick win even if you keep MCP.

3. **Add dynamic tool filtering to MCP.** The `ListToolsRequest` handler
   could accept hints (via MCP roots or custom metadata) to return only
   relevant tool subsets.

4. **Deprecate MCP for Claude Code.** Switch Claude Code sessions to use the
   CLI via system prompt. Keep MCP for other clients.

5. **Optionally build the thin MCP adapter** from CLI, replacing the current
   hand-written MCP tools.

---

## Recommendation

**Build the flat-verb CLI.** The critical design decision is to **not** have a
`browse` subcommand that takes a command string. Instead, `telescope snapshot`,
`telescope click @e5`, `telescope fill @e12 "hello"` are first-class verbs that
transparently resolve the frame and spawn agent-browser underneath.

This means the agent writes:

```bash
telescope snapshot -i
telescope click @e5
telescope create frame "https://example.com"
telescope annotations --status pending
```

Not:

```
browse(command="snapshot -i")
upsert_entities(items=[{kind:"frame", url:"https://example.com"}])
get_annotations(status="pending")
```

The CLI is a ~300-line dispatcher: classify verb → browser or canvas → call
the right thing. The HTTP control server (`routes/`, 2,328 lines) stays
untouched. Agent-browser stays untouched. The MCP layer (`mcp-*.ts`, ~1,550
lines) gets replaced by argument parsing and JSON output formatting.

Start with 6 commands: `workspace`, `snapshot`, `click`, `fill`, `screenshot`,
`create`. That covers the core interaction loop. Add canvas and annotation
verbs incrementally. Keep MCP as a thin adapter for non-Claude clients.
