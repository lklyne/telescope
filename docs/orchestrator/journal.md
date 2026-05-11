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

## 2026-05-11
Surveyed: First real run — baseline of 14 merged PRs (2026-05-07–2026-05-11), queue depths, and the two proposals filed by yesterday's seed run.
Acted:
- #68 (new) — filed orchestrator-proposal on AFK pipeline habit gap; two instances: 0/14 AFK PRs, `ready-for-agent` queue at 0.
- docs/orchestrator/journal.md — this entry, opened as PR against main.
Noticed (no action): Proposals #61 (SKILL.md drift CI check) and #63 (CI workflow absorbing #61) both filed 2026-05-10 and both open. #63 explicitly subsumes #61 yet #61 was not closed when #63 was filed — self-leak to encode: when a proposal supersedes another, close the superseded issue in the same action rather than leaving both open. Also: 5 ADRs (0003–0007) filed in 5 days; watch whether /grill-with-docs is driving these or they are being written manually after decisions settle.
Hint for next run: compare AFK pipeline fraction to today's 0/14 baseline; check whether #61 and #63 have been acted on or are rotting; check whether #53 (needs-triage) was routed or resolved ad hoc — that signal tells you whether /triage is habitual.
