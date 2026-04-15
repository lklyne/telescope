# Context Passing: Wormhole → Claude Code

Research into mechanisms for passing context (comments, drawings, selected elements) from Wormhole back to Claude Code.

---

## Current State

Wormhole already has a **robust MCP server** (`mcp-helper.ts`) that exposes 13 tools to Claude Code. This gives Claude read/write access to workspace state (frames, groups, edges, selection, camera). The question is: how to extend this to support **human feedback** — annotations, comments, drawings, and element selections that a user makes on the canvas.

---

## Approaches (Spectrum from Simple to Complex)

### 1. Clipboard / Paste (Simplest)

**How it works:** User selects elements or makes annotations in Wormhole, clicks "Copy for Claude", structured markdown is placed on clipboard. User pastes into Claude Code.

**This is what Agentation v1 does.** It captures CSS selectors, element positions, and user notes, then outputs structured markdown the user copies into their AI chat.

| Pros | Cons |
|------|------|
| Zero infrastructure | Requires manual copy/paste per interaction |
| Works with any AI tool | No real-time feedback loop |
| User controls exactly what's shared | Breaks flow — context switching |
| No auth/security concerns | Can't support continuous workflows |

**Best for:** Quick, one-off feedback. Low commitment.

---

### 2. File-Based Communication

**How it works:** Wormhole writes annotation/comment data to a well-known file (e.g., `.wormhole/annotations.json`). Claude Code reads it via its normal file access, or a CLAUDE.md instruction tells it to check the file.

| Pros | Cons |
|------|------|
| Simple to implement | Polling or manual triggers needed |
| Claude can read files natively | No push notifications to Claude |
| Persistent — survives restarts | File format must be designed carefully |
| Works without MCP | Latency (Claude doesn't watch files) |

**Data format example:**
```json
{
  "annotations": [
    {
      "id": "ann_1",
      "type": "comment",
      "target": { "frameId": "frame_1", "selector": ".header > h1", "boundingBox": { "x": 100, "y": 50, "w": 200, "h": 30 } },
      "content": "This heading is too large on mobile",
      "author": "user",
      "timestamp": "2026-03-05T10:00:00Z",
      "status": "pending"
    }
  ]
}
```

**Best for:** Simple integrations where real-time isn't critical.

---

### 3. Extend Existing MCP Server (Recommended Starting Point)

**How it works:** Add annotation-related tools to the existing MCP server in `mcp-helper.ts`. Claude can query, acknowledge, and respond to annotations.

**This is what Agentation 2.0 does.** Their MCP server exposes 9 tools:
- `list_sessions` — list active annotation sessions
- `get_session` — get a session with all annotations
- `get_pending_annotations` — unacknowledged annotations for a session
- `get_all_pending` — pending across ALL sessions
- `acknowledge_annotation` — mark as handled
- `dismiss_annotation` — decline with reason
- `reply_to_annotation` — add to annotation thread
- `watch_annotations` — **blocks until new annotations appear**, then returns batch

**New tools Wormhole could add:**
```
get_annotations        — Get all annotations/comments on canvas
get_pending_annotations — Get unacknowledged annotations
acknowledge_annotation  — Mark annotation as handled
reply_to_annotation     — Claude responds to user feedback
get_selected_elements   — Get details of user's current selection
get_drawing_annotations — Get freehand drawings/markup
watch_for_feedback      — Block until user adds new annotation
```

| Pros | Cons |
|------|------|
| Leverages existing MCP infrastructure | More tools = more context window usage |
| Real-time push via `watch` pattern | Requires state management for annotations |
| Bidirectional — Claude can reply | MCP tool descriptions consume tokens |
| Agentation proves this pattern works | Need to design annotation data model |
| Claude can proactively check for feedback | |

**Best for:** Most use cases. Natural extension of what Wormhole already does.

---

### 4. MCP Resources (Read-Only Context)

**How it works:** Instead of tools (which Claude calls), expose annotations as MCP **resources** — data Claude can read on demand. Resources are like documents Claude can access.

```
wormhole://annotations/pending
wormhole://annotations/all
wormhole://selection/current
wormhole://canvas/screenshot
```

| Pros | Cons |
|------|------|
| Semantic separation (reads vs actions) | Resources are read-only (no acknowledge/reply) |
| Can include large data (screenshots) | Less mature in Claude Code's MCP support |
| Natural for "context" vs "actions" | Would need tools alongside for writes |

**Best for:** Supplementing tools with rich read-only context.

---

### 5. Screenshot/Image-Based Context

**How it works:** Wormhole captures screenshots of annotated canvas regions and passes them to Claude via MCP tool responses (as base64 images) or file paths.

**Key insight:** Claude is multimodal. A screenshot with drawn arrows and circles can convey spatial relationships that structured data cannot.

| Pros | Cons |
|------|------|
| Captures spatial/visual intent perfectly | Large token cost for images |
| Works for drawings and freehand markup | Claude can't always map pixels → code |
| Users can express things words can't | Need element selectors alongside for actionability |
| Natural for design feedback | Screenshot capture adds complexity |

**Best for:** Design/layout feedback. Combine with selectors for actionability.

---

### 6. CLAUDE.md Instructions + Conventions

**How it works:** Use CLAUDE.md to instruct Claude to proactively check for annotations. This is a "soft" integration — no new tools needed, just conventions.

```markdown
# CLAUDE.md
Whenever the user mentions annotations or feedback, use the
get_annotations tool before doing anything else. Check for pending
annotations at the start of each task.
```

**Agentation does this.** Their CLAUDE.md says: *"Whenever the user brings up annotations, fetch all the pending annotations before doing anything else."*

| Pros | Cons |
|------|------|
| Zero code changes | Relies on Claude following instructions |
| Easy to iterate on behavior | Not deterministic |
| Can shape entire workflow | Can't force proactive checking |

**Best for:** Shaping Claude's behavior around any of the above mechanisms.

---

### 7. Hooks (Pre/Post Tool Execution)

**How it works:** Claude Code supports hooks — shell commands that run before/after tool calls. A hook could inject annotation context automatically.

Example: A `PreToolUse` hook that checks for pending annotations and surfaces them in Claude's context before every edit.

| Pros | Cons |
|------|------|
| Automatic — no manual triggering | Runs on every tool call (performance) |
| Can inject context transparently | Limited to shell command output |
| Works with existing tool flow | Complex to debug |

**Best for:** Automatic context injection without Claude needing to call tools.

---

### 8. Dedicated Annotation MCP Server (Separate Process)

**How it works:** Run a separate MCP server dedicated to annotations, independent from the workspace MCP. This separates concerns.

| Pros | Cons |
|------|------|
| Clean separation of concerns | Two MCP servers to manage |
| Can be reused across projects | More moving parts |
| Independent lifecycle | Extra configuration for users |

**Best for:** If annotations become a major feature deserving its own server.

---

## What Agentation Teaches Us

Agentation's evolution is instructive:

1. **v1 (Clipboard):** User annotates → copies markdown → pastes to Claude. Simple but manual.
2. **v2 (MCP):** Annotations flow directly to Claude via MCP. Real-time, bidirectional. The `watch_annotations` tool is key — it blocks until new annotations appear, creating an event-driven loop.

**Key design decisions from Agentation:**
- **Selectors over screenshots:** `.sidebar > button.primary` is more actionable than a screenshot. Claude can grep for selectors in code.
- **Acknowledge/dismiss pattern:** Annotations have lifecycle states (pending → acknowledged/dismissed). This prevents Claude from re-processing old feedback.
- **Reply threading:** Claude can ask clarifying questions on annotations, creating a conversation.
- **Session-based grouping:** Annotations are grouped by browser session, matching the "page I'm looking at" mental model.

---

## Recommendation for Wormhole

Given that Wormhole **already has a working MCP server**, the highest-value path is:

### Phase 1: Extend MCP Tools (Low effort, high value)
1. Add annotation data model to workspace state
2. Add `get_annotations`, `get_pending_annotations`, `acknowledge_annotation` tools
3. Add `get_selected_elements` tool (returns selector + bounding box for current selection)
4. Update CLAUDE.md to instruct Claude to check annotations

### Phase 2: Watch Pattern (Medium effort, enables real-time)
5. Add `watch_for_feedback` tool (blocks until new annotation, returns batch)
6. This enables a "self-driving" mode where Claude monitors for feedback continuously

### Phase 3: Rich Context (Higher effort, premium experience)
7. Add screenshot capture for annotated regions
8. Combine screenshots with selectors for maximum context
9. Add drawing/freehand markup support with spatial data

### Data Model Sketch
```typescript
interface Annotation {
  id: string
  type: 'comment' | 'drawing' | 'selection' | 'pin'
  target: {
    frameId: string
    selector?: string          // CSS selector for element
    boundingBox?: BoundingBox  // position on canvas
    url?: string               // page URL at time of annotation
    viewport?: string          // e.g., "mobile", "tablet"
  }
  content: {
    text?: string              // user's comment
    drawingData?: string       // SVG path or canvas data
    screenshot?: string        // base64 or file path
  }
  status: 'pending' | 'acknowledged' | 'dismissed' | 'resolved'
  replies: Array<{
    author: 'user' | 'claude'
    text: string
    timestamp: string
  }>
  createdAt: string
}
```

---

## Tradeoff Summary

| Approach | Effort | Real-time | Bidirectional | Works Today |
|----------|--------|-----------|---------------|-------------|
| Clipboard/paste | Trivial | No | No | Yes |
| File-based | Low | No | No | Yes |
| **MCP tools (extend)** | **Medium** | **Yes (watch)** | **Yes** | **Partial** |
| MCP resources | Medium | No | No | No |
| Screenshots | Medium | No | No | No |
| CLAUDE.md | Trivial | No | No | Yes |
| Hooks | Medium | Yes | No | No |
| Separate MCP server | High | Yes | Yes | No |
