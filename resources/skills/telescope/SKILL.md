---
name: telescope
description: Drive Telescope — a spatial canvas for iterating on web UI — from Claude Code. Use this skill whenever you need to pull a live website into a shared canvas, arrange frames at breakpoints, annotate pages, or inspect snapshots.
---

# Telescope

Telescope is a spatial canvas that lets you pull live web pages (frames) onto a
freeform surface, view them at different breakpoints, and annotate them. All
canvas and frame operations go through the `telescope` command.

## Core workflow

1. `telescope workspace` — list the current canvas: frames, groups, edges, annotations.
2. `telescope create frame <url>` — pull a live site onto the canvas as a frame.
3. `telescope snapshot -i` — get element refs for the selected frame (or `-f <frameId>`).
4. `telescope click @<ref>` / `telescope fill @<ref> "<text>"` — interact.
5. `telescope snapshot -i` — re-snapshot after DOM mutations (refs go stale).

## Common commands

| Command | Purpose |
|---|---|
| `telescope workspace` | Print the current canvas state as JSON |
| `telescope selection` | Print the currently selected entities |
| `telescope create frame <url>` | Add a live page to the canvas |
| `telescope create note <text>` | Add a text note to the canvas |
| `telescope upsert --json < items.json` | Batch create/update entities (frames, notes, files) |
| `telescope update <id> …` | Update properties on an existing entity |
| `telescope delete <id>` | Remove an entity |
| `telescope focus <id>` | Scroll the viewport so the entity is centered |
| `telescope find-placement` | Find open canvas space for new entities |
| `telescope link <a> <b>` | Connect two frames with an edge |
| `telescope group <id…>` | Group entities together |
| `telescope breakpoints <id>` | Cycle through device breakpoints for a frame |
| `telescope annotate "<text>"` | Leave an annotation on the canvas |
| `telescope annotations` | List unresolved annotations (pending + acknowledged) |
| `telescope annotations --status <s>` | Filter by specific status (`pending`, `acknowledged`, `resolved`, `dismissed`) |
| `telescope annotations --all` | Include resolved + dismissed too |
| `telescope annotation <id>` | Get full detail for one annotation (elements, screenshot, replies) |
| `telescope ack <id>` / `telescope resolve <id>` | Respond to an annotation |
| `telescope snapshot -i` | Capture an accessibility snapshot with refs |
| `telescope click @<ref>` | Click an element by ref |
| `telescope fill @<ref> "<text>"` | Fill a form field |
| `telescope screenshot -f <id>` | Screenshot a frame |

## Entity types

| Kind | Created via | Description |
|---|---|---|
| frame | `telescope create frame <url>` | Live web page rendered in a webview |
| text | `telescope create note <text>` | Short text note (sticky-note style) |
| file | `telescope upsert --json` | File entity — markdown (`.md`) or wireframe (`.wireframe.json`) |

### Wireframes

Files ending in `.wireframe.json` render as interactive wireframe editors on the
canvas. Use them to sketch UI layouts, explore design variants, and iterate
spatially alongside live frames. Write the JSON file to disk, then upsert it:

```bash
cat << 'EOF' | telescope upsert --json
[{ "kind": "file", "file": "/tmp/my-layout.wireframe.json", "width": 300 }]
EOF
```

See [references/wireframes.md](references/wireframes.md) for the full node schema, layout patterns, and examples.

## Passing URLs

Always pass full URLs (including scheme and host) to `telescope create frame`.
The canvas can contain frames from different origins, so bare paths like
`/garden` are ambiguous. Use `http://localhost:4321/garden`, not `/garden`.

## Chaining

Commands can be chained with `&&` for atomic sequences:

```
telescope create frame http://localhost:3000 && telescope snapshot -i
```

## See also

- `agent-browser` skill — deeper browser-automation reference (invoked via
  `telescope snapshot`, `telescope click`, etc. under the hood).
