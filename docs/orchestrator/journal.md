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

## 2026-05-10 (first real run)
Surveyed: Last 30 merged PRs, Lyle's commits since May 3, issue queues (`needs-triage`, `ready-for-agent`, `orchestrator-proposal`), CI workflows, and `.claude/skills` history.
Acted:
- #63 — Proposed basic PR CI workflow (`typecheck` + `test:unit` + SKILL.md diff). Two observed instances of manual "typecheck + test:unit pass" documentation in structural rename commits: `telescope → specular` (#36) and `frame → page` (#50). Absorbs open proposal #61 as a step in the same workflow — no separate workflow file needed.
Noticed (no action): AFK pipeline dormant — `ready-for-agent` queue = 0, all 30 recent PRs authored by lklyne (Claude co-authors via sessions but doesn't open PRs independently). The two `[codex]`-prefixed PRs (#25, #26) from April 23 are the only prior AFK-style artifacts visible. Not a leak; looks like an intentional HITL workflow. Baseline to track: if `ready-for-agent` stays at 0 for 3+ weeks while `needs-triage` grows, that's signal the triage-to-agent routing isn't working.
Hint for next run: Watch whether #63 and #61 land or stall. If neither is acted on within ~2 weeks, stop proposing new CI and write a "why aren't proposals converting?" reflection instead.
