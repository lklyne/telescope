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

### Upsert tips

`upsert --json` is the fastest way to create many entities at once. For
**frames**, it honors `canvasX`, `canvasY`, `presetIndex`, and
`orientation: "landscape" | "portrait"` — use it to drop a batch of frames
at exact positions with the right device preset in one call:

```bash
cat << 'EOF' | telescope upsert --json
[
  {"kind":"frame","url":"https://example.com","presetIndex":6,"orientation":"landscape","canvasX":200,"canvasY":200},
  {"kind":"frame","url":"https://example.com","presetIndex":0,"canvasX":1520,"canvasY":200}
]
EOF
```

For **files** (markdown, wireframe, image) upsert ignores `canvasX/canvasY` —
the layout engine always places them. Images additionally ignore `width`.

### Note colors

`color` on text notes (and group labels) expects a **JSON Canvas preset id
`"1"`–`"6"`** or a hex string. CSS color names like `"yellow"` or `"red"` are
NOT presets — they silently fall through and render as raw CSS (vivid
`#FFFF00`, `#FF0000`, etc.), which clashes hard with the canvas palette.

| id | label | hex |
|---|---|---|
| `"1"` | Red | `#e8b4b8` |
| `"2"` | Orange | `#e8ccb0` |
| `"3"` | Yellow | `#FFE18E` |
| `"4"` | Green | `#b8d8c8` |
| `"5"` | Cyan | `#b0d0d8` |
| `"6"` | Purple | `#c8b8d8` |

Use `"3"` not `"yellow"`. Hex (`"#FFE18E"`) is also valid when you need a
custom tone.

### Note sizes

Default to the built-in 200×200 sticky-note size — it's tuned to sit well
next to frames on the canvas. Only pass `width`/`height` when there's an
explicit reason (e.g. a long-form card that really needs more room). Custom
sizes tend to look off against the rest of the workspace.

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

## Switching the active frame

Browse verbs (`snapshot`, `click`, `fill`, `scroll`, `screenshot`) need a target
frame. There is no persistent "active frame" binding — pass `-f <frameId>` on
every browse call:

```
telescope snapshot -i -f <frameId>
telescope click @e3 -f <frameId>
```

`telescope focus <id>` only scrolls the canvas viewport — it does not set the
active frame.

## Useful verbs

> **Assumed — verify when you first use each.** `telescope back` has been
> confirmed once; `forward` and `reload` are inferred from the CLI help and
> have not been directly tested.

- `telescope back` / `telescope forward` / `telescope reload` — browser history
  navigation inside the active frame. Handy after `click` navigates you away
  and you want to return.

## Known CLI limitations

> **Treat this list as known assumptions, not ground truth.** Entries reflect
> behavior observed at the time they were added. Codepaths change, and some
> items here may already be fixed or may present differently in your session.
> If something behaves unexpectedly, re-test before trusting the list — a
> stale warning is worse than no warning.

- **`telescope breakpoints <id>` creates sibling frames with malformed URLs** — the new frames get `https://<sourceFrameId>/` instead of the source frame's real URL, so they load an invalid host instead of mirroring the page. Unusable as a multi-breakpoint primitive until fixed.
- **`telescope update <id> --url` is a silent no-op** — the command returns `updated: [id]` but neither the webview nor the workspace URL field changes. Use `telescope click` on a link, or delete + recreate the frame, to navigate.
- **`telescope update` silently ignores unsupported flags** — `--width`, `--label`, `--url` all return `updated: [id]` while applying nothing. Only `--preset / --at / --text / --color / --landscape / --portrait` actually take effect. Re-read workspace to verify.
- **`telescope link` does not validate entity ids** — self-edges and edges to nonexistent ids are accepted and stored. Confirm both endpoints exist before calling `link`.
- **`telescope delete <annotation_id>` silently lies** — the generic `delete` verb accepts annotation ids and returns `{"items":[{"kind":"file","id":"ann_...","deleted":true}]}` but does NOT call the annotation DELETE route. The annotation stays. Call `DELETE /annotations/:id` via raw HTTP, or wait for a dedicated verb.
- **`telescope delete --json` requires `[{"id":"..."}]`, not `["..."]`** — the natural string-array shape crashes with `Cannot read properties of undefined (reading 'startsWith')`. Wrap each id in an object.
- **`upsert --json` ignores `x`/`y`/`width` for `file` entities** — text entities honor explicit coordinates; file entities (markdown, wireframe, image) are always placed by layout. Images additionally ignore `width` and land at 128×128.
- **Search box `fill` + `click` may not trigger navigation** — `fill` may not fire input events. If a click on Search fails, re-fill and retry, or click an autocomplete option ref instead.

## See also

- `agent-browser` skill — deeper browser-automation reference (invoked via
  `telescope snapshot`, `telescope click`, etc. under the hood).
