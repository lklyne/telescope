# Orchestrator journal

Append-only log for the Specular workflow orchestrator (a scheduled Claude routine).
Each run reads the last ~5 entries before acting, then appends one entry at the bottom.

Write **insight**, not activity. "Surveyed 8 PRs, triaged 2" is noise. "PRs in
`canvas-bg/entity-renderers/` keep needing a follow-up for keyboard handling —
worth a deepening proposal" is signal.

Format per entry:

```
## YYYY-MM-DD
Surveyed: <one line — what you looked at and the dominant theme>
Acted:
- <#issue/PR or path> — <what + why>
Noticed (no action): <patterns worth watching>
Hint for next run: <one sentence for tomorrow-you>
```

---

## 2026-05-10 (seed)
Surveyed: nothing yet — first run, system being set up.
Notes: scope clarified — orchestrator watches the *automation system*, not the product. Output is proposals to improve the system (skills, prompts, labels, habits), not actions inside the system. Operating skills already in place: `/triage`, `/to-issues`, `/to-prd`, `/grill-with-docs`, `/improve-codebase-architecture`.
Hint for next run: on first real run, baseline the system. Count merged PRs in the last week, what fraction came via the AFK pipeline, current `needs-triage` and `ready-for-agent` queue depths, and when the skills directory was last touched. That snapshot is what future runs compare against to spot leaks.

## 2026-05-11
Surveyed: ADR 0006 implementation batch — slices 2–4 of the canvas stack-order plan (sidebar Notes/Pages partition; page WCV restack in `entityOrder`; aboveView body layers iterating `entityOrder`).
Acted:
- `src/shared/sidebar-partition.ts` + `tests/unit/sidebar-partition.test.ts` — extracted the partition algorithm as a pure module so the ADR's split-row invariants are unit-tested without standing up the runtime. Cleaner than mocking sidebar-builder.
- `src/main/runtime/sidebar-builder.ts`, `LeftSidebarData.sections` — replaced flat `items` with `{ notes, pages }`. One smoke test + the renderer updated atomically; no back-compat shim.
- `applyStack()` in `layer-stack.ts` now walks `entityOrder` to attach pages between bgView and aboveView. `markDirty('stack')` already fired from page-factory create; added to `removePageAtIndex` for symmetry.
- `buildCanvasLayoutData` sorts the `entities` array by `entityOrder` rank — body layers inherit the correct paint order without per-layer changes.
Noticed (no action): `syncEntityOrder` still clobbers `entityOrder` on every diff-sync (pages → text → file → drawing → shape → groups). That's the slice-1 runtime-wrapper gap, called out in the ADR. Read-side slices establish the plumbing; user-visible behavior won't shift until reorder mutations land in slices 5/6/7. When that wrapper is written, this is the place reorder writes must funnel through to avoid being trampled.
Hint for next run: the next natural slice is the runtime wrapper (`src/main/runtime/entity-order-state.ts`) + HTTP routes for the four mutations. Smoke tests for slices 3/4 (overlapping stickies/pages and the click-resolves-correctly assertion) need that wrapper before they can drive reorders end-to-end.
