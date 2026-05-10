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

## 2026-05-10
Surveyed: first real run — 12 merged PRs (last week), issue queues, skills history, commit patterns. Dominant theme: all velocity is HITL, automation pipeline not yet flowing.
Acted:
- #61 — Proposed CI check for SKILL.md drift. Three observed instances of the manual sync task (April 24 dedicated sync commit; May 7 skill-bundles commit; May 8 rename sweep). CLAUDE.md documents the prose rule but there is no enforcement gate. A single `diff` in CI turns the rule into a hard check.
Noticed (no action):
- **AFK pipeline throughput: 0%.** All 12 PRs merged this week were HITL — Lyle driving Claude Code interactively. `ready-for-agent` queue is empty. Issue #53 (Cmd+Z in file-backed markdown, filed May 9) is the only `needs-triage` item and has sat untriaged for 24h. This is likely intentional at this stage — Lyle is shipping fast and the pipeline hasn't been seeded with AFK-suitable work yet. Establish this as the baseline: if the ratio is still 0% in a month, investigate whether `/triage` is running and whether briefs are good enough.
- **`/simplify` pattern is working**: 6+ PRs this month include a trailing `refactor: simplify` commit. The skill is clearly in use and landing. Not a leak — evidence the skill is pulling weight.
- **Issue tracker used as record, not queue**: several issues (e.g. #48, #49) appear to have been filed and immediately worked on in the same session, bypassing triage. This is fine when the issue is Lyle's own — but it means the AFK input queue never accumulates. Worth watching if AFK adoption is a goal.
Hint for next run: check whether #61 (SKILL.md CI check) was accepted or rejected, and watch `ready-for-agent` queue depth — if still 0 in a week, the triage bottleneck is worth proposing a fix for.
