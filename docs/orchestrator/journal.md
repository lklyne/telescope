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
