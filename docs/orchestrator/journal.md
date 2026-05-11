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
