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

---

## 2026-05-10 (first real run)
Surveyed: 30 merged PRs, Lyle's commit log, queue depths, CI state, skills history. Dominant theme: establishing baseline.
Acted:
- #61 — CI check for SKILL.md drift (three observed instances of manual sync: April repair commit, May-06 skills-only touch, May-08 rename sweep). Smallest fix: a diff gate in CI.
- #63 — CI workflow proposal (typecheck + test:unit + SKILL.md diff). Explicitly absorbs #61. Two instances of Lyle manually noting "typecheck + test:unit pass" in commit messages.
- #62, #64 — journal PRs filed (duplicate; the run fired twice, producing two PRs for the same date — a self-failure)
Noticed (no action): /simplify being invoked at the tail of most PRs (pattern in commit messages). AFK pipeline at 0/12 PRs — same as the seed hint predicted.
Hint for next run: check whether #61 was closed when #63 superseded it; check AFK fraction; watch for journal PR accumulation.

---

## 2026-05-11
Surveyed: AFK pipeline fraction (14 merged PRs week-to-date), needs-triage staleness (issue #53, 2 days old), orchestrator proposal status.
Acted:
- #68 — AFK habit gap proposal. Lyle's flow is idea → interactive Claude session → PR; zero issues routed through /triage → ready-for-agent. Two instances: 0/14 AFK fraction + empty ready-for-agent queue. Proposed a one-sentence routing heuristic added to /to-issues.
- #69 — journal PR filed.
Noticed (no action): #61 still open alongside #63 (not closed after being superseded). ADR cadence high: 5 ADRs (0003–0007) in 5 days. SKILL.md was touched in the May-08 and May-10 PRs — skills keeping pace with domain changes, not a leak.
Hint for next run: check whether any of the three proposals (#61, #63, #68) have been acted on; if all three are still open and unreviewed, the bottleneck is review bandwidth, not automation gaps — note it and don't add more proposals.

---

## 2026-05-12
Surveyed: Journal PR accumulation and proposal review status. Three journal PRs (#62, #64, #69) open unmerged; three proposals (#61, #63, #68) open unreviewed. needs-triage: 1 item (issue #53, now 4 days old). ready-for-agent: 0. AFK fraction: still 0/14+.
Acted:
- Filed self-modifying proposal (see issue below) — orchestrator creates one journal PR per run, causing PRs to pile up rather than stacking. Proposed: detect open journal PRs before filing a new one; add to the same branch instead of opening a second.
- Filed this consolidated journal entry covering 2026-05-10 (first real run), 2026-05-11, and 2026-05-12.
Noticed (no action): The system is producing output (proposals, journal PRs) faster than it is being reviewed. This is not an automation failure — the orchestrator is working. It is a human-bandwidth constraint. Adding more proposals into an unreviewed queue adds noise. Correct response: hold until existing proposals are actioned.
Hint for next run: if proposals #61, #63, #68 are still all open with no comments, write "why is nothing landing?" into the journal rather than proposing again. The answer is more useful than another proposal.

---

## 2026-05-13
Surveyed: Proposal review status, AFK pipeline fraction (PRs #74–#80 merged today), issue queue, housekeeping debt. Dominant theme: the AFK pipeline activated overnight; the concern in #68 self-corrected.
Acted:
- #61 closed — superseded by #63 since 2026-05-10 but never closed. Pending housekeeping debt settled.
- #71 closed — journal PR stacking fix is now implemented in the orchestrator's own prompt ("Journal PR mechanics" section). The pre-flight check this run found no open journal PR and correctly opened a single new one.
Noticed (no action):
- **AFK pipeline is live.** PR #76 (keyboard binding registry, dex epic `ypz5rro1`) merged today with 5 step PRs (#75, #77, #78, #79, #80) — all produced by the AFK agent in under 8 hours. AFK fraction flipped from 0/14 to a full epic overnight. The gap #68 described was real during the architectural sprint; it self-corrected once a bounded, well-specified plan (#74) existed.
- **Proposals #63 and #68 have zero comments and zero activity.** Asking "why?" yields a different answer than before: #68's gap has now closed on its own, so the proposal is likely moot. #63 (CI workflow) is the only live proposal. It requires adding one YAML file — that is agent-executable. It has never been labeled `ready-for-agent`, which means it has no path through the pipeline that just proved itself capable of delivering a 5-step refactor overnight.
- **Issue #81 filed today** — 5-phase test coverage plan. Each phase is bounded and has clear acceptance criteria. A natural candidate for the AFK pipeline once Phase 0 (decisions) is answered in comments.
- **Issue #53** (`needs-triage`) is now 4 days old and still unrouted. Pattern: bugs that require architectural discussion (it is) park here indefinitely.
Hint for next run: check if #63 has been labeled `ready-for-agent`; if not, that is the only systemic gap worth watching — a CI workflow addition is exactly the kind of bounded task the pipeline can absorb.

---

## 2026-05-14
Surveyed: PRs #84–#98 (two full AFK epics overnight + interactive fixes), afk-loop.sh mid-flight bug fixes visible in PR #90 and the #97 squash commit, open proposal status. Dominant theme: AFK pipeline at full velocity after activation yesterday.
Acted:
- #68 closed — definitively resolved. Two full AFK epics shipped in ~24h: test coverage overhaul (#84–#87, dex epic `nrsnaunt`) and canvas drag affordances (#93–#97, dex epic `awuhzpwz`). The pipeline concern #68 tracked is gone.
Noticed (no action):
- **AFK loop self-corrects mid-run, but each new worker variant reveals platform-specific bugs.** The canvas-drag epic encountered three infrastructure failures: codex's mcp_servers blocking startup, the sandbox blocking git writes, and dex completion not being committed to the feature branch (loop re-completed task 7kjdgp84 for ~16 fires before the fix). All three were absorbed into PR #90 and the #97 squash. This is healthy — the fixes compound into the infrastructure. But the pattern is consistent: first run of cloud→local→codex each time surfaces a new class of issue. Watch for the same on the next novel variant.
- **CLI smoke coverage still a floating deferred.** PR #86 explicitly deferred `tests/smoke/cli.test.ts` ("CLI subprocess testing needs a built CLI in the smoke setup pipeline") and documented it in the PR body — but did not file a tracking issue. `tests/README.md` (PR #85) lists intentionally-uncovered surfaces; if cli.test.ts is not there, the deferral is invisible to the pipeline. One instance; watch for a second.
- **#63 (CI workflow) noted for the third consecutive run with no review, no label, no comment.** Two runs ago the 2026-05-13 entry called it "agent-executable"; yesterday's entry noted it had no `ready-for-agent` label. Nothing has moved. This is now a pattern in the orchestrator output, not just the proposal queue.
Hint for next run: the stasis on #63 (noted 3 runs, 0 movement) is the signal — if it persists, the question is whether any proposal generated by this orchestrator has a path to action, and if not, the orchestrator's output format or routing is the problem.

---

## 2026-05-15
Surveyed: 0.3.0 release (commits d400bba–7f6881f), the post-release release.yml CI update, proposal #63 status (day 5, 0 comments), recent commit log.
Acted:
- No proposals filed. No stale orchestrator output to close (#63 is 5 days old; stale threshold is 7).
Noticed (no action):
- **#63 (CI workflow) — fourth run, zero movement.** Repeating the observation again is noise. By the orchestrator's own cleanup rule it ages out on 2026-05-17. Next run should close it as stale if still frozen; continuing to note it is itself the leak.
- **Release 0.3.0 shipped with a blank GitHub Releases page; Lyle patched release.yml immediately after (commit d400bba).** CI improvements that land arrive when the pain is visceral and immediate, not from a proposal queue. This may be the real diagnosis for why #63 hasn't moved — there's no failing PR to point at, only a hypothetical improvement. The trigger for a PR CI workflow is probably the first time a type error or failing test slips through a merged PR, not a calendar date.
- **AFK pipeline stable at full velocity.** `afk-local` skill added, codex worker option added, loop bugs fixed in #90. No watch items here.
- **Draft PRs aging** (#9 at 26 days, #29 at 22 days, #32 at 21 days). Lyle's product decisions; not orchestrator scope.
Hint for next run: close #63 if it hits 7 days (2026-05-17) with no comment; watch for a type error or test regression slipping through a PR as the natural trigger for the CI workflow — that's a better proposal moment than this one.

---

## 2026-05-16
Surveyed: Post-0.3.0 steady state, PRs #29 (fallow setup) and #121 (popup-menus-v2 integration) merging yesterday, #63 staleness status (day 6), proposal queue.
Acted:
- No stale items closed. #63 is 6 days old; the >7-day threshold triggers on 2026-05-17. One day short.
Noticed (no action):
- **#63 closes tomorrow.** Next run closes it as stale (0 comments, 0 activity in 7 days). After that, the orchestrator proposal queue is empty for the first time since the system started. That's a natural pause point.
- **Fallow is now live in the ecosystem** (PR #29, 22-day draft, merged 2026-05-15). It's a static analysis tool for dead code, circular deps, complexity. One instance of setup; watch whether it gets invoked regularly or was a one-time installation pass. Not actionable yet — need a second instance to know if it's a habit forming.
- **Three consecutive runs with no new proposals filed** (May 14–16). This is correct behaviour given the May 15 diagnosis: CI changes land from pain, not queues. Restraint here is the right call, not a failure to observe.
- **Two patterns from May 14 are still at one instance each:** (a) AFK loop first-run failures for novel worker variants; (b) CLI smoke coverage deferral with no tracking issue. Both need a second sighting before they're proposal-ready.
Hint for next run: close #63 as stale; then with a clear queue, do a fresh two-instance audit — have either of the May 14 watch items (AFK first-run failures, CLI smoke deferral) seen a second occurrence in the PRs since May 14?
