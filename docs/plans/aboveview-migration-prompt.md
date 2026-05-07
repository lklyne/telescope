# AboveView migration — Ralph prompt

You are continuing the aboveView interactive-layer migration. The endpoint and
phase plan live in `docs/plans/aboveview-interactive-layer.md` (read §8 every
iteration; §6 has manual scenarios; §9 has carve-outs).

The PoC landed on `poc/page-input-forwarding`. You are now on
`aboveview-migration`. The loop runs autonomously through all six phases
(A → B → B′ → C → D → F). E and G are deferred per the plan and not in scope.

There is **no human pause between phases**. Smoke tests are deferred to the
very end of the migration — do **not** run `pnpm test:smoke` mid-loop.

## Read order — every iteration

1. `docs/plans/aboveview-migration-journal.md` — last entry tells you where
   you are and what just happened.
2. `docs/plans/aboveview-interactive-layer.md` — find current phase in §8 and
   the next unfinished step.
3. The current code state of the file(s) you are about to touch.

## What "one chunk" means

A single bullet from the current phase, or a coherent slice if a bullet is
large. Each iteration produces ONE commit. Do not bundle.

## Per-iteration loop

1. **Decide.** Identify current phase + next unfinished step from journal + plan.
2. **Implement.** Edit code directly when the change is mechanical. Spawn an
   `Explore` subagent only when broad codebase context is needed.
3. **Verify.** Run `pnpm typecheck` and `pnpm test:unit`. Both must be green
   before you commit. Do not run `pnpm test:smoke`.
4. **Commit.** Semantic message via HEREDOC, on `aboveview-migration`.
5. **Log.** Append a journal entry — see "Journal format" below.
6. **Continue or stop.** See "Stop conditions" below.

## Phase transitions

When the current phase's acceptance criteria are met, in the same iteration:

1. Append a `### PHASE <X> COMPLETE — <one-line summary>` entry to the journal.
2. Continue immediately to the next phase per §8 sequencing
   (A → B → B′ → C → D → F). No pause, no extra commit.

## Stop conditions

Stop the loop and do **not** schedule another wakeup if any of:

- **Tests fail.** Roll back staged changes (`git restore --staged .` then
  `git checkout -- <files>`). Log the failure with exact command output. Status
  `red`. Do not commit.
- **Blocked.** Ambiguity in the plan, a needed decision, or a blocking
  carve-out (§9). Log what's blocked. Status `blocked`.
- **Migration complete.** All six phases (A, B, B′, C, D, F) marked PHASE
  COMPLETE in the journal. Then:
    1. Run `pnpm test:smoke`. This is the final gate.
    2. Log the result verbatim.
    3. If green: append `## MIGRATION COMPLETE — ready for review` and stop.
    4. If red: log every failing test with output and stop. Do **not** attempt
       to fix — a smoke failure after this many commits needs human triage.

Otherwise: continue. Use `ScheduleWakeup` with `delaySeconds: 120` (cache-warm)
to take the next chunk. Pass this same prompt path back so the next firing
re-enters the loop.

## Manual scenarios and carve-outs

§6 scenarios that require running the app and observing UI cannot be verified
by the loop. When relevant to the chunk you just landed:

- Append a `MANUAL: §6 scenario #N — <what to verify>` line to the journal entry.
- These accumulate for the human to walk through at the end of the migration.
- Do **not** claim them verified.

§9 carve-outs (drag-out, IME, DevTools-while-focused, trackpad inertia):
revisit each at its mapped phase. Document the outcome in the journal with
whatever evidence you have (unit tests, code-reading). If verification needs
runtime observation, flag MANUAL.

## Hard rules

- Branch invariant: every commit is on `aboveview-migration`. Never push to
  `main`. Never force-push. Never use `--no-verify`.
- The journal is APPEND-ONLY. Never rewrite past entries. To correct a mistake,
  write a new entry that supersedes it.
- Never delete the plan, the journal, or this prompt.
- §8's "one phase per merge" instruction is overridden for this run: one
  branch, no human merge between phases.
- Co-author every commit per repo convention:
  `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## Journal format

Each entry:

```
### <ISO timestamp> — Phase <X> — <one-line summary>

- **Did:** <bullets>
- **Observed:** <bullets — test output, code reading, surprises>
- **Next:** <one-line — what the next iteration will pick up>
- **Status:** green | red | blocked
- **Manual:** <list of §6 scenarios flagged this iteration; omit if none>
```

Phase boundary entries:

```
### PHASE <X> COMPLETE — <one-line summary>

- **Acceptance:** <which criteria from §8 phase X are now met, with evidence>
- **Manual debt accumulated this phase:** <list of §6 MANUAL flags from this phase>
- **Next phase:** <X+1 per A → B → B′ → C → D → F sequencing>
```

Final entry:

```
## MIGRATION COMPLETE — ready for review

- **Smoke result:** <pasted output or "<N> tests passed">
- **Total commits:** <count>
- **Manual scenarios pending human walkthrough:** <list>
- **Carve-outs status:** <one line per §9 row>
```
