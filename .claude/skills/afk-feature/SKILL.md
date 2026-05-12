---
name: afk-feature
description: Kick off an AFK multi-PR feature build from a planning doc. Spawns a fresh-context cloud worker that walks the dex epic step by step, opens a PR per step into a feature branch, and finishes with one integration PR for the user to review. Use when the user wants to "go work on this plan AFK", "run this overnight", or "spin up a worker for docs/plans/X".
---

# AFK feature

One-shot kickoff for a multi-PR feature built unattended by a cloud worker routine.

Inputs: a path to a planning doc (markdown), usually under `docs/plans/`. The plan is expected to break the feature into ordered steps — the established Specular pattern (see PR 74 / `docs/plans/keyboard-binding-registry.md`).

Output: a long-running cloud worker routine wired to a feature branch + a dex epic, plus a single URL the user can watch. Laptop can close.

## Kickoff sequence

1. **Validate input.** Confirm the plan file exists and looks like a Specular step plan (has a status table or ordered steps). If not, stop and ask the user to pick a better doc.
2. **Derive a feature slug.** From the plan filename: `docs/plans/keyboard-binding-registry.md` → `keyboard-binding-registry`. Branch name: `feat/<slug>`.
3. **Create the feature branch off the current HEAD.** `git fetch origin && git switch -c feat/<slug> && git push -u origin feat/<slug>`. The feature branch inherits whatever the kickoff branch contains — that's how the worker gets `.claude/skills/afk-feature/worker.md` without it being on main. If the user wants the feature branched off `main` specifically, they'll say so; default is HEAD.
4. **Ingest plan into dex.** `dex plan <plan-path>` — captures the epic ID and the task IDs from stdout. Record the epic ID; the worker needs it.
5. **Discover routine settings to clone.** Call `RemoteTrigger` action=list. Take `job_config.ccr.environment_id` and `session_context.sources` from the first enabled routine on this repo (the orchestrator). We're reusing the cloud env that already works.
6. **Create the worker routine.** `RemoteTrigger` action=create, body:
    - `name`: `AFK: <slug>`
    - `cron_expression`: `7,17,27,37,47,57 * * * *` (every 10m, off the round minute)
    - `enabled`: true
    - `job_config.ccr.environment_id`: copied from step 5
    - `job_config.ccr.events`: one user message whose content is the worker prompt template below, with `<EPIC_ID>` and `<FEATURE_BRANCH>` substituted
    - `session_context.allowed_tools`: `["Bash","Read","Write","Edit","Glob","Grep","WebFetch","RemoteTrigger"]` — RemoteTrigger is required so the worker can self-trigger and self-disable
    - `session_context.outcomes`: `[{"git_repository":{"git_info":{"branches":["feat/<slug>"],"repo":"<owner/repo>"}}}]`
    - `session_context.sources`: copied from step 5
    - `persist_session`: false
7. **Patch the routine with its own ID.** `RemoteTrigger` action=update on the new routine, replacing `<SELF_ROUTINE_ID>` in the prompt with the routine ID returned in step 6 (so the worker can self-trigger and self-disable without lookup).
8. **Kick it off immediately.** `RemoteTrigger` action=run on the routine.
9. **Report back to the user.** Print:
    - The routine name and the claude.ai run URL (returned by create).
    - Epic ID and the planned number of steps (count from `dex list`).
    - `dex list` and `gh pr list --base feat/<slug>` as the two commands they can run to check progress.

## Worker prompt template

This is the prompt embedded in the routine. Each fire reads `.claude/skills/afk-feature/worker.md` from the feature branch and follows it. Keep the embedded prompt thin so we can iterate on worker.md without recreating routines.

```
You are an AFK feature worker.

Repo: <OWNER/REPO>
Feature branch: <FEATURE_BRANCH>
Dex epic: <EPIC_ID>
Your routine ID: <SELF_ROUTINE_ID>

Each fire, do this and only this:

1. git fetch origin
2. git switch <FEATURE_BRANCH> (if it no longer exists, exit cleanly — feature is shipped or aborted)
3. Read .claude/skills/afk-feature/worker.md from the working tree
4. Follow the instructions there exactly, substituting the variables above

Do not invent extra work. Do not refactor outside the current step's scope.
```

## When the user invokes this skill

- Single argument is the plan path. Resolve relative to repo root.
- If the user passes `--dry-run`, do read-only work only: validate the plan (step 1), derive the slug (step 2), call `RemoteTrigger` action=list to confirm a settings donor exists (step 5), then **print** the branch name, the proposed `dex plan` invocation, the routine payload that would go to `RemoteTrigger.create`, and the worker prompt with substitutions filled in. Do not create the branch, do not run `dex plan`, do not create the routine.
- If a routine named `AFK: <slug>` already exists, refuse to create a second — print the existing routine URL instead.

## Stopping an AFK run

The user stops it by calling `RemoteTrigger` action=update with `enabled: false`. The worker will also disable itself when the epic completes (see worker.md).
