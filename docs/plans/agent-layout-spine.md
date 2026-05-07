# Agent Layout Spine

Branch: `claude/agent-layout-guidance-UuRCO`. Plan for the two primitives that
collapse most agent-driven layout failures: a declarative `layout` directive
on `upsert` (covering both new and existing items), and a `workspace --check`
feedback loop. Auto-layout groups are explicitly out of scope here — see
[Future work](#future-work-auto-layout-groups-humans).

## Status

| Phase | Status |
|---|---|
| 1 — `layout` directive on `upsert --json` (creates + re-layout) | ⬜ not started |
| 2 — `specular workspace --check` | ⬜ not started |
| 3 — Skill update | ⬜ not started |

## Context

Agents that write to the canvas struggle with composition: they guess pixel
coordinates, overlap entities, pick off-scale gaps, and don't notice when their
output looks bad. Today's primitives (`upsert --json`, `find-placement`, `group`)
require the agent to do the layout math, then verify by reading back JSON they
can't visually interpret.

Two additions cover ~80% of these failures without growing the verb list:

1. **Declarative `layout` directive on `upsert`** — agents describe intent
   (`row`, `column`, `grid`) instead of computing coordinates. Crucially, the
   directive applies to items with an `id` too, so the same call that creates
   N frames in a row also reorganizes N existing frames into a row.
2. **`workspace --check`** — one-call feedback that flags overlaps, off-scale
   gaps, and near-misalignment so agents self-correct.

Together these turn layout from "agent computes positions" into "agent describes
composition; canvas places, validates, and reports." Persistent enforcement
(auto-layout groups for humans, drag-to-swap, etc.) is a separate problem;
agents re-emit the directive when they want it re-applied.

## Build order

1. **Phase 1 — `layout` directive on upsert.** Validates the spacing-scale
   vocabulary and delivers the agent's primary tool for both layout and
   re-layout.
2. **Phase 2 — `workspace --check`.** Independent of phase 1, but agents using
   the directive will lean on `--check` to verify output.
3. **Phase 3 — Skill update.** Single edit at the end so examples reflect the
   final shape.

## Existing scaffolding

A scan before drafting turned up partial work that this plan builds on:

- `src/main/shared/entity-ops.ts:35-38` — `UpsertOptions` already has `layout`
  and `gap`. They flow into `/layout/batch-placement` at lines 97-108, but
  only fire for *creates without `canvasX/Y`* (the `needsPlacement` filter at
  line 76). Phase 1 generalizes this to all items in the call, including ones
  with an `id`.
- `src/main/shared/entity-ops.ts:66-72` — items with an `id` already route to
  update buckets. The plumbing for re-layout-by-id exists; only the
  position-computation step needs to learn about it.
- `BatchLayoutMode` in `src/shared/types.ts` — current values are the
  starting point for the directive's `kind` enum.

Group schema fields (`WorkspaceGroupEntity.layoutMode`, `managedLayout`) and
the `WorkspaceGroupLayoutMode` enum exist but are unused by the runtime. They
remain unused after this plan; see Future work.

## Phase 1 — `layout` directive on `upsert --json`

### Shape

The existing array form keeps working. New object form:

```json
{
  "layout": { "kind": "row", "gap": "m", "originX": 200, "originY": 200 },
  "items": [
    { "kind": "frame", "url": "https://a.example.com" },
    { "kind": "frame", "url": "https://b.example.com" }
  ]
}
```

### Re-layout of existing items

Items in the directive may carry an `id` instead of (or in addition to)
creation attrs. The directive computes new positions for them too. This is
the primary "clean up the canvas" verb:

```json
{
  "layout": { "kind": "grid", "cols": 3, "gap": "m", "near": "frame_a" },
  "items": [
    { "id": "frame_a" }, { "id": "frame_b" }, { "id": "frame_c" },
    { "id": "frame_d" }, { "id": "frame_e" }, { "id": "frame_f" }
  ]
}
```

Mechanics:

- The size used for layout math is the entity's current width/height (read
  from runtime state). Patches in the same item (e.g. `presetIndex`) are
  applied first so the new size is honored.
- Items with `id` route to the existing update buckets in
  `entity-ops.ts:66-72`. The new step is: when a `layout` directive is
  present, compute positions for *all* items (creates and updates) in one
  pass and override `canvasX`/`canvasY` on each before bucket-routing.

### Layout kinds (v1)

- `row` — left-to-right, `gap` between
- `column` — top-to-bottom, `gap` between
- `grid` — `cols` required, optional `rowGap` and `colGap` (default both to `gap`)

### Anchoring

Resolved in this order:

1. Explicit `originX` / `originY`
2. `near: <id>` — place adjacent to an existing entity, with `gap` between.
   When the only `id` references in `items[]` are the things being
   re-laid-out, `near` lets you anchor to a separate landmark.
3. Default — for pure-create directives, `find-placement` finds open canvas
   space. For directives containing existing IDs, the bounding box of those
   items' current positions becomes the implicit origin (so re-layout doesn't
   teleport the cluster).

### Spacing scale

Accept both tokens and numbers. All token values are multiples of `GRID_SIZE`
(20px) so they survive snap-to-grid intact:

| Token | Pixels |
|---|---|
| `xs` | 20 |
| `s` | 40 |
| `m` | 60 |
| `l` | 100 |
| `xl` | 160 |

Examples in the skill default to tokens. Numbers remain an escape hatch.

### Item-level coordinates inside a directive

Per-item `canvasX` / `canvasY` are ignored when a `layout` directive is
present, for both creates and updates. Emit a warning in the response so
agents notice. Per-item attrs like `presetIndex`, `width`, `height`, `text`
still apply (and feed the layout math).

### Files

- `src/main/shared/entity-ops.ts` — extend `UpsertOptions` to accept the
  full directive (kind, gap, cols, originX/Y, near). Replace the
  `needsPlacement` filter (line 76) with: when a `layout` directive is
  present, compute positions for *all* items; otherwise keep existing
  per-item behavior.
- `src/main/cli-commands.ts:64-77` — the `upsert` handler currently reads
  `args.flags.layout` as a string. Extend to accept the directive object
  from stdin JSON's top-level `layout` field (when stdin is the object form
  rather than the array form).
- New helper `src/main/runtime/layout-math.ts` — pure functions:
  `computeRow(items, gap, origin)`, `computeColumn(...)`, `computeGrid(...)`.
- Optional: factor existing batch-placement logic in
  `/layout/batch-placement` to share `layout-math.ts` so behavior is
  identical between the new directive and the legacy auto-placement path.
- `tests/unit/layout-math.test.ts` — pure-math coverage.
- `tests/smoke/upsert-layout.test.ts` — end-to-end via AppClient, including:
  pure-create row, pure re-layout of existing IDs into a grid, and a mixed
  case (3 existing + 2 new in one column).

### Edge cases

- Mixing frames (today honor `canvasX/Y`) and file entities (today auto-placed)
  — directive overrides both.
- Empty `items` — no-op.
- Single item — place at resolved origin, ignore `gap`.
- Heterogeneous-sized items in a row — align top by default; `align` field is
  v2.
- Items with explicit `canvasX/Y` — warn and ignore.
- Re-layout where one of the items doesn't exist — error the whole call,
  return the bad ID. Don't partially apply.
- `near: <id>` referencing one of the items being re-laid-out — fine; resolve
  `near` against the entity's *original* position (before re-layout).

## Phase 2 — `specular workspace --check`

### Output

JSON by default for agents:

```json
{
  "overlaps": [{ "a": "id1", "b": "id2", "amount": 12 }],
  "misaligned": [{ "id": "id3", "near": "row y=200", "delta": 4 }],
  "offScale": [{ "between": ["id1", "id2"], "gap": 37, "suggest": 40 }]
}
```

`--pretty` for human reading:

```
1 overlap: frame_a and frame_b (12px)
1 misaligned: frame_c is 4px below the row at y=200
1 off-scale gap: 37px between frame_a and frame_b (round to 40)
```

### Rules in v1

- **Overlap** — AABB intersection. Exclude parent-group/member pairs and edges.
  Highest-signal, must ship.
- **Off-scale gap** — gap between adjacent entities not within tolerance of the
  spacing scale. Tolerance: ±3px. Suggest the nearest token.
- **Misalignment** — cluster y values into implicit rows; flag entities whose y
  is within 1–8px of a cluster's baseline but not on it. Same for columns.
  Heuristic; ship behind a `--rules` flag if it false-positives in practice.

### Out of v1

- **Off-canvas / orphan** — ill-defined on an unbounded canvas. Revisit if
  agents actually create orphans.
- **Width/size consistency** — flagging mismatched widths in a row. Defer until
  it's clear agents need it.

### Files

- New `src/main/runtime/layout-check.ts` — pure rule evaluators.
- Wire into the workspace route in `src/main/routes/` (path TBD; verify during
  implementation).
- `tests/unit/layout-check.test.ts` — one test per rule, including
  near-miss/no-flag cases for tolerance correctness.

### Tradeoffs

- False positives are worse than false negatives. Tight tolerances. Better to
  under-report than nag.
- Allow `--rules overlap,offscale` to disable misalignment. Cheap insurance.

## Phase 3 — Skill update

A single edit to `resources/skills/specular/SKILL.md` and
`.claude/skills/specular/SKILL.md` (kept in sync per the CLAUDE.md skill-files
note).

Changes:

- Replace the canonical upsert example in `### Upsert tips` with the new
  `{layout, items}` shape using a 3-frame row at breakpoints.
- Add a second example showing re-layout of existing IDs into a grid — this
  is the "clean up the canvas" pattern and deserves first-class billing.
- Add a 2-line note: "Use `layout` instead of computing `canvasX`/`canvasY`
  for more than 2 items. The same directive reorganizes existing entities
  when items carry an `id`."
- Add 1 line at the end of the workflow: "Run `specular workspace --check`
  after batch creates."
- Add the spacing-scale table.

Do **not** add a separate "Layout" section. Folding into existing structure
keeps skill bloat minimal.

## Future work — auto-layout groups (humans)

Persistent layout enforcement on groups is a different problem motivated by
direct manipulation, not agent reliability. It belongs in its own plan
because:

- Agents don't need it — they re-emit the layout directive when they want
  re-application. Phase 1 covers their use case.
- The hard parts are UX, not runtime: drag-to-reorder, drag-to-swap content,
  the "this is managed" affordance, snap-back vs. block-drag tradeoffs.
- The schema fields (`layoutMode`, `managedLayout` on `WorkspaceGroupEntity`)
  already exist; they remain unused until that plan lands. Adding `gap`,
  `padding`, and `'column'` to the enum is part of that future plan.

If a future agent-side use case demands persistent enforcement, the
`layout-math.ts` helper from Phase 1 is reusable as-is.

## Cross-cutting decisions (settled)

- **Spacing tokens vs. numbers.** Both. Tokens default in skill examples;
  numbers as escape hatches.
- **Misalignment rule.** Ship in v1, narrow band (1–8px), opt-out via
  `--rules`.
- **Backwards compat.** Existing array-form `upsert --json` keeps working
  unchanged. The object form is additive.
- **Re-layout vs. create symmetry.** The directive applies to both creates
  and items with `id`; mixing is allowed. One verb covers both.
- **No partial application on re-layout error.** If any referenced `id`
  doesn't exist, the whole call errors. Avoids silent half-applied layouts.

## Open decisions (decide during phase 1)

- **Anchor vocabulary for `near`.** `near: <id>` plus an implicit "to the right
  of" for `row` directives, "below" for `column`. Or accept `side: 'right' | 'below'`.
  Decide once a real example surfaces.
- **`grid` row-major vs. column-major.** Default row-major (fill rows
  left-to-right, then wrap). Confirm during implementation if grid examples
  argue otherwise.

## Risks

- **Layout directive doesn't get adopted** because the skill example isn't
  compelling. Mitigation: canonical examples are (a) the breakpoint
  comparison scenario for creates and (b) "reorganize 6 frames into a 3×2
  grid" for re-layout — the latter is the most-asked agent task today.
- **`--check` becomes noisy** and agents start ignoring it. Mitigation: tight
  tolerances, opt-out flag, only ship rules with high signal-to-noise.
- **Re-layout teleports content unexpectedly** when no anchor is given.
  Mitigation: implicit origin = bounding box of the existing items being
  re-laid-out (see Anchoring rule 3). Agents who *want* the cluster moved
  pass `originX/Y` or `near` explicitly.

## Out of scope (this plan)

- **Auto-layout groups (persistent enforcement, drag-to-reorder, drag-to-swap).**
  See [Future work](#future-work-auto-layout-groups-humans).
- Tour mode / ordered traversal (separate plan; relates to Explain use case).
- Image/video/text export (separate plan; relates to handoff).
- Compositional grammar primitives (`comparison`, `sequence`, etc.) — these
  build on the spine; revisit after it lands.
- Spatial diff / canvas review verb.
- Quick-capture flow for Research use case.
- `find-placement` extensions (`--row-of N`, `--grid 3x2`). Useful but
  redundant with the `layout` directive once it lands.
