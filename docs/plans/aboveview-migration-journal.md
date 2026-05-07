# AboveView migration journal

- **Branch:** `aboveview-migration` (cut from `poc/page-input-forwarding` after
  PoC verdict on 2026-05-06).
- **Plan:** `docs/plans/aboveview-interactive-layer.md` §8.
- **Prompt:** `docs/plans/aboveview-migration-prompt.md`.
- **Loop driver:** `/loop` self-paced via `ScheduleWakeup`.

This journal is **append-only**. Each Ralph iteration appends one entry. Phase
transitions and the final completion entry are appended here too. To correct a
past mistake, write a new entry that supersedes it — never rewrite history.

## Status at a glance

Phases (per §8 sequencing A → B → B′ → C → D → F):

- [ ] Phase A — collapse `frame-focus.*` into selection
- [ ] Phase B — selection outlines + resize handles into aboveView
- [ ] Phase B′ — honor entity z-order in body hit-test
- [ ] Phase C — sticky / text / shape entity bodies into aboveView
- [ ] Phase D — file entity bodies + edges into aboveView
- [ ] Phase F — bgView reduces to grid only + keyboard owner flip

(E and G are deferred per the plan and out of scope for this migration.)

## Manual scenarios pending human walkthrough

Accumulated as the loop runs. Each entry is a §6 scenario the loop flagged
because it requires observing the running app.

(none yet — first iteration will populate)

---

## Entries

(no entries yet — first iteration of the loop creates the first one)
