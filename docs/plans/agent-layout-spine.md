# Agent Layout Spine

Branch: `claude/agent-layout-guidance-UuRCO`. Plan for the three primitives that
collapse most agent-driven layout failures: a declarative `layout` directive
on `upsert`, auto-layout groups, and a `workspace --check` feedback loop.

## Status

| Phase | Status |
|---|---|
| 1 — `layout` directive on `upsert --json` | ⬜ not started |
| 2 — `specular workspace --check` | ⬜ not started |
| 3 — Auto-layout groups (runtime honors `managedLayout`) | ⬜ not started |
| 4 — Skill update | ⬜ not started |

## Context

Agents that write to the canvas struggle with composition: they guess pixel
coordinates, overlap entities, pick off-scale gaps, and don't notice when their
output looks bad. Today's primitives (`upsert --json`, `find-placement`, `group`)
require the agent to do the layout math, then verify by reading back JSON they
can't visually interpret.

Three additions cover ~80% of these failures without growing the verb list
meaningfully:

1. **Declarative `layout` directive** — agents describe intent (`row`, `column`,
   `grid`) instead of computing coordinates.
2. **Auto-layout groups** — groups with `managedLayout: true` enforce direction,
   gap, and padding on members. The schema is already in place; the runtime
   needs to honor it.
3. **`workspace --check`** — one-call feedback that flags overlaps, off-scale
   gaps, and near-misalignment so agents self-correct.

Together these turn layout from "agent computes positions" into "agent describes
composition; canvas places, validates, and reports."

## Build order

1. **Phase 1 — `layout` directive on upsert.** Smallest scope; validates the
   spacing-scale vocabulary before it gets baked into idea 8's runtime work.
2. **Phase 2 — `workspace --check`.** Independent of phase 1, but agents using
   the directive will lean on `--check` to verify output.
3. **Phase 3 — Auto-layout groups.** Biggest surface area (UX, runtime, persistence
   already partly done). Reuses the layout-math helper from phase 1.
4. **Phase 4 — Skill update.** Single edit at the end so examples reflect the
   final shape.

## Existing scaffolding

A scan of the codebase before drafting turned up partial work:

- `src/shared/types.ts:309` — `WorkspaceGroupLayoutMode = 'freeform' | 'row' | 'grid'`
  already exists on groups.
- `src/shared/types.ts:199` — `layoutMode` and `managedLayout` are persisted
  fields on `WorkspaceGroupEntity`.
- `src/main/runtime/group-entity-state.ts:43` — defaults are `'freeform'` and
  `false`.
- `src/main/runtime/json-canvas-serializer.ts:399` — round-trips both fields.
- `src/main/runtime/layout-engine.ts` — does **not** read either field. This is
  the runtime gap idea 8 has to close.

`'column'` is missing from the enum and will need to be added. The schema lacks
`gap` and `padding` on groups — both need to be added before phase 3 can land.

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

### Layout kinds (v1)

- `row` — left-to-right, `gap` between
- `column` — top-to-bottom, `gap` between
- `grid` — `cols` required, optional `rowGap` and `colGap` (default both to `gap`)

### Anchoring

Resolved in this order:

1. Explicit `originX` / `originY`
2. `near: <id>` — place adjacent to an existing entity, with `gap` between
3. Default — `find-placement` finds open canvas space

### Spacing scale

Accept both tokens and numbers:

| Token | Pixels |
|---|---|
| `xs` | 8 |
| `s` | 16 |
| `m` | 24 |
| `l` | 40 |
| `xl` | 80 |

Examples in the skill default to tokens. Numbers remain an escape hatch.

### Item-level coordinates inside a directive

Per-item `canvasX` / `canvasY` are ignored when a `layout` directive is present.
Emit a warning in the response so agents notice. Per-item attrs like
`presetIndex`, `width`, `height`, `text` still apply.

### Files

- Upsert handler — TBD; route lives in `src/main/routes/`, runtime call is in
  `src/main/runtime/`. Confirm during implementation.
- New helper `src/main/runtime/layout-math.ts` — pure functions:
  `computeRow(items, gap, origin)`, `computeColumn(...)`, `computeGrid(...)`.
  Consumed by phase 1 and phase 3.
- CLI parsing for the new shape — `resources/specular-cli.sh` is a shell
  shim; the JSON parsing lives server-side.
- `tests/unit/layout-math.test.ts` — pure-math coverage.
- `tests/smoke/upsert-layout.test.ts` — end-to-end via AppClient.

### Edge cases

- Mixing frames (today honor `canvasX/Y`) and file entities (today auto-placed)
  — directive overrides both.
- Empty `items` — no-op.
- Single item — place at resolved origin, ignore `gap`.
- Heterogeneous-sized items in a row — align top by default; `align` field is
  v2.
- Items with explicit `canvasX/Y` — warn and ignore.

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

## Phase 3 — Auto-layout groups

The schema is already in place (`layoutMode`, `managedLayout`). This phase wires
the runtime to honor those fields and extends the schema with `gap` and
`padding`.

### Schema extensions

On `WorkspaceGroupEntity`:

- Add `'column'` to `WorkspaceGroupLayoutMode` enum: `'freeform' | 'row' | 'column' | 'grid'`.
- Add `gap?: number | SpacingToken` (default `'m'` when `managedLayout: true`).
- Add `padding?: number | [v, h] | [t, r, b, l]` (default `0`).
- For `grid`, add `cols?: number` (default 2).

JSON Canvas extension fields per `docs/file-formats.md` §Specular extensions.
Update that doc as part of phase 3.

### Runtime behavior

When a group has `managedLayout: true`:

- Member positions are computed by the group, not user input.
- Adding a member appends and re-flows.
- Removing closes the gap.
- Reordering = mutating `members` order; positions follow.
- Group move = members move with it (existing behavior, unchanged).

### Manual drag of layout-managed members

**v1 decision: block manual drag of members in a layout-managed group. Allow
drag of the group itself.**

Rationale: agents don't drag, so they're unaffected. Humans get a clear "this
is managed" signal instead of confusing snap-back. Drag-to-reorder lands as v2
if humans request it.

Visible affordance: managed groups render with a distinct border/icon so the
disabled drag is explicable.

### Files

- `src/main/runtime/layout-engine.ts` — read `managedLayout`, dispatch to
  `layout-math.ts` helpers.
- `src/main/runtime/group-entity-state.ts` — add `gap`/`padding` accessors and
  re-flow on member add/remove/reorder.
- `src/main/runtime/json-canvas-serializer.ts` — persist new fields.
- `src/shared/types.ts` — extend enum and entity type.
- `src/shared/json-canvas-types.ts` — extend persisted shape.
- `src/renderer/canvas-bg/` — disable member drag when `managedLayout: true`;
  render the affordance.
- `docs/file-formats.md` — document `gap`, `padding`, and the extended enum.
- `tests/unit/group-layout.test.ts` — add/remove/reorder behavior.
- `tests/smoke/managed-group.test.ts` — end-to-end.

### Edge cases

- Single-member group — degenerate; render as if `freeform`.
- Nested layout groups — recursion is fine because `layout-math.ts` is pure.
- Heterogeneous-sized members — align top by default in row; left in column.
  `align` is v2.
- Toggling `managedLayout: false` → `true` on an existing group — re-flow on
  toggle so positions snap to the directive.

## Phase 4 — Skill update

A single edit to `resources/skills/specular/SKILL.md` and
`.claude/skills/specular/SKILL.md` (kept in sync per the CLAUDE.md skill-files
note).

Changes:

- Replace the canonical upsert example in `### Upsert tips` with the new
  `{layout, items}` shape using a 3-frame row at breakpoints.
- Add a 2-line note: "Use `layout` instead of computing `canvasX`/`canvasY` for
  more than 2 items."
- Add 2 lines under groups: "Set `managedLayout: true` to auto-arrange members
  in a row, column, or grid."
- Add 1 line at the end of the workflow: "Run `specular workspace --check`
  after batch creates."
- Add the spacing-scale table.

Do **not** add a separate "Layout" section. Folding into existing structure
keeps skill bloat minimal.

## Cross-cutting decisions (settled)

- **Spacing tokens vs. numbers.** Both. Tokens default in skill examples;
  numbers as escape hatches.
- **Manual drag in layout-managed groups.** Block in v1; reorder in v2.
- **Misalignment rule.** Ship in v1, narrow band (1–8px), opt-out via
  `--rules`.
- **Backwards compat.** Existing array-form `upsert --json` keeps working
  unchanged. The object form is additive.
- **`'column'` on `WorkspaceGroupLayoutMode`.** Add. Required for column
  layouts in both phase 1 and phase 3.

## Open decisions (decide during phase 1)

- **Anchor vocabulary for `near`.** `near: <id>` plus an implicit "to the right
  of" for `row` directives, "below" for `column`. Or accept `side: 'right' | 'below'`.
  Decide once a real example surfaces.
- **`grid` row-major vs. column-major.** Default row-major (fill rows
  left-to-right, then wrap). Confirm during implementation if grid examples
  argue otherwise.

## Risks

- **Layout directive doesn't get adopted** because the skill example isn't
  compelling. Mitigation: canonical example is the breakpoint comparison
  scenario — the same shape that motivates the audit use case.
- **`--check` becomes noisy** and agents start ignoring it. Mitigation: tight
  tolerances, opt-out flag, only ship rules with high signal-to-noise.
- **Auto-layout groups confuse humans** when drag is blocked. Mitigation:
  clear affordance on managed groups; disable drag silently rather than with
  an error toast.
- **Schema drift** between the existing `layoutMode` enum and the new
  `kind` field on the upsert directive. Mitigation: use the same string
  values everywhere (`'row' | 'column' | 'grid'`); the directive's `kind`
  is what gets written to the group's `layoutMode` when an upsert creates a
  managed group.

## Out of scope (this plan)

- Tour mode / ordered traversal (separate plan; relates to Explain use case).
- Image/video/text export (separate plan; relates to handoff).
- Compositional grammar primitives (`comparison`, `sequence`, etc.) — these
  build on the spine; revisit after it lands.
- Spatial diff / canvas review verb.
- Quick-capture flow for Research use case.
- `find-placement` extensions (`--row-of N`, `--grid 3x2`). Useful but
  redundant with the `layout` directive once it lands.
