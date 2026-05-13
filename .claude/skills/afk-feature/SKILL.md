---
name: afk-feature
description: Kick off an AFK multi-PR feature build from a planning doc. Spawns a fresh-context cloud worker routine that walks a dex epic step by step, opens one PR per step into a feature branch, and finishes with one integration PR for the user to review. Use when the user wants to "go work on this plan AFK", "run this overnight", or "spin up a worker for docs/plans/X".
---

# AFK feature

One-shot kickoff for a multi-PR feature built unattended by a cloud worker routine.

Inputs: a path to a planning doc (markdown) under `docs/plans/` with a Status table whose rows describe ordered steps (PR-74 / `keyboard-binding-registry.md` is the canonical shape).

Output: a cloud worker routine wired to a `claude/feat-<slug>` branch + a dex epic with one subtask per step. The user gets a routine URL and walks away.

## Architectural notes

- **Cron minimum is 1h** (enforced by the routines service). The kickoff cron is the safety net only. The fast path between steps is the worker self-triggering via `RemoteTrigger.run` after it opens or merges a PR.
- **Routines can only push to `claude/`-prefixed branches** by default. We use `claude/feat-<slug>` for the feature branch and `claude/task-<id>` for each step branch, so no per-repo permission tweak is needed.
- **The routines creation HTTP API is internal.** Use the `/schedule` skill to create the routine — that's the supported path. Do not call `RemoteTrigger` action=create directly.
- **`RemoteTrigger.run` and `RemoteTrigger.update` are stable** and used for self-trigger and self-disable from inside worker fires.
- An optional native GitHub trigger (`pull_request.closed`, merged=true, base=`claude/feat-<slug>`) can be added in the web UI later for instant pickup after a human merges a step PR. Don't set it up in the kickoff.

## Kickoff sequence

1. **Validate input.** Confirm the plan file exists and has a Status table with at least 2 ordered rows. If not, stop and ask the user to pick a better doc.
2. **Derive a feature slug.** From the plan filename: `docs/plans/keyboard-binding-registry.md` → `keyboard-binding-registry`. Feature branch: `claude/feat-<slug>`.
3. **Create the feature branch off the current HEAD.** `git fetch origin && git switch -c claude/feat-<slug> && git push -u origin claude/feat-<slug>`. The feature branch inherits whatever the kickoff branch contains — that's how the worker gets `.claude/skills/afk-feature/worker.md`. If the branch already exists locally or remotely, switch to it instead of recreating.
4. **Ingest plan into dex.** `dex plan <plan-path>` — captures the **epic ID** from stdout (single root task; dex doesn't auto-split).
5. **Decompose the epic into per-step subtasks.** Parse the plan's Status table (look for a markdown table where the first column is a step label like `A — ...`). For each row, run:
   ```
   dex create "<step-label>: <one-line-description-from-row>" --parent <epic-id> --description "<full description: the relevant section from the plan>"
   ```
   The first row depends on nothing; each subsequent row uses `--blocked-by` (if dex supports it) or the worker just walks them in order. Record all child task IDs.
6. **Commit `.dex/` to the feature branch and push.** The worker reads dex state from the working tree on each fire — it must be in the branch.
   ```
   git add .dex/ && git commit -m "chore(afk): ingest <slug> plan into dex epic" && git push
   ```
7. **Create the worker routine via `/schedule`.** Invoke the `/schedule` skill with:
    - Name: `AFK: <slug>`
    - Cron: `13 * * * *` (hourly at :13, off the round minute)
    - Prompt: the worker prompt template below, with `<OWNER/REPO>`, `<FEATURE_BRANCH>`, `<EPIC_ID>` substituted. Leave `<SELF_ROUTINE_ID>` as a placeholder — we patch it after create.
    - Repository: this repo, branch `claude/feat-<slug>`
    - Allowed tools: ensure `RemoteTrigger` is included alongside the defaults (Bash, Read, Write, Edit, Glob, Grep, WebFetch, gh CLI access). If `/schedule` doesn't expose `allowed_tools` directly, note this to the user — they may need to edit the routine in the web UI to add `RemoteTrigger`.
8. **Capture the routine ID.** After `/schedule` returns, call `RemoteTrigger` action=list and find the routine with the matching name. Capture its ID.
9. **Patch the prompt with the routine's own ID.** `RemoteTrigger` action=update on the new routine, body sets the prompt with `<SELF_ROUTINE_ID>` substituted to the actual ID. (If the routine-update API doesn't accept full prompt edits, fall back to telling the user to open the routine in the web UI and paste the patched prompt manually.)
10. **Kick off immediately.** `RemoteTrigger` action=run on the routine.
11. **Report back to the user.** Print:
    - Routine name + claude.ai run URL.
    - Epic ID and child task IDs (one per step).
    - Two watch commands: `dex list --json` and `gh pr list --base claude/feat-<slug>`.
    - One optional follow-up: "For instant pickup after manual merges, add a GitHub trigger on `pull_request.closed` (merged=true, base=`claude/feat-<slug>`) in the web UI."

## Worker prompt template

The prompt embedded in the routine. The worker reads `.claude/skills/afk-feature/worker.md` from the feature branch each fire and follows it. The embedded prompt stays thin so worker.md can be iterated on without recreating routines.

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

Do not invent extra work. Do not refactor outside the current step's scope. One PR per fire, max.
```

## Invocation modes

- Single argument is the plan path, resolved relative to repo root.
- `--dry-run`: read-only. Validate plan (step 1), derive slug (step 2), parse step rows (step 5 parse only — don't write), print the proposed branch name, the `/schedule` invocation, and the worker prompt with substitutions. Do not create the branch, do not run `dex plan`, do not call `/schedule`, do not call `RemoteTrigger`.
- If a routine named `AFK: <slug>` already exists, refuse to create a second — print the existing routine URL.

## Stopping an AFK run

`RemoteTrigger` action=update with `enabled: false`. The worker also disables itself when the epic completes (see worker.md).
