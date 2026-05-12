# AFK worker — per-fire instructions

You are running in a fresh cloud context. Repo is checked out on the feature branch. You have the variables `<OWNER/REPO>`, `<FEATURE_BRANCH>`, `<EPIC_ID>`, `<SELF_ROUTINE_ID>` from the kickoff prompt.

Do **one** unit of work per fire, then exit. Never wait inside a fire. If there is nothing to do, exit quickly.

## Decision tree

Run each step in order. The first one that fires ends the fire (unless it says otherwise).

### 1. Is the feature already done?

```
dex show <EPIC_ID> --json
```

If all child tasks are completed → open the integration PR if it doesn't exist yet:

```
gh pr list --head <FEATURE_BRANCH> --base main --state open --json number
```

If no open PR: open it. Title `<feature slug>: integration`, body links to the epic and lists each step's PR. Then disable own cron:

```
RemoteTrigger update <SELF_ROUTINE_ID>  body: {"enabled": false}
```

Exit. The user reviews and merges the integration PR.

### 2. Is a step's PR open and unmerged?

```
gh pr list --base <FEATURE_BRANCH> --state open --json number,headRefName,mergeable
```

If any open PR targets `<FEATURE_BRANCH>`:
  - If it's mergeable and CI green → merge it (`gh pr merge --squash --auto`), `dex complete` the linked task, then **self-trigger immediately** (`RemoteTrigger run <SELF_ROUTINE_ID>`) and exit. The next fire (or the immediate self-trigger) picks up the next task.
  - Otherwise → exit. We're waiting for CI or human review.

### 3. Has an in-progress task's PR already merged out of band?

```
dex list --in-progress --json
```

For each in-progress task, find its branch (`task-<short-id>` convention, see step 4) and check if it's merged into `<FEATURE_BRANCH>`. If merged → `dex complete <id> --commit <sha>`, self-trigger, exit.

### 4. Start the next pending task.

```
dex list --json
```

Find the first task with status `pending` whose `blocked_by` are all `completed`. Read its full description (`dex show <id> --full`).

Branch off the feature branch:

```
git switch -c task-<short-id> <FEATURE_BRANCH>
```

Implement the task per its description. Stay narrowly scoped to that step. Run `pnpm typecheck` and `pnpm test:unit` before committing — anything that touches runtime also needs `pnpm test:smoke`.

Commit, push, open PR into `<FEATURE_BRANCH>`:

```
gh pr create --base <FEATURE_BRANCH> --head task-<short-id> --title "..." --body "Closes dex task <id>. <one-paragraph summary>"
```

Mark the dex task in-progress and link the PR:

```
dex start <id>
dex edit <id> --commit <sha>   # optional, links the head commit
```

Self-trigger and exit:

```
RemoteTrigger run <SELF_ROUTINE_ID>
```

### 5. Nothing to do.

If none of the above apply (e.g. all tasks are blocked, or everything in_progress with PRs still in CI) — exit silently. The next cron fire will look again.

## Failure handling

- **Typecheck or tests fail repeatedly** on a task: don't keep retrying blindly. Set the task to a blocked state by editing its description with a `BLOCKED: <reason>` prefix, then exit. The next fire will skip it (rule: pending tasks whose description starts with `BLOCKED:` are not picked up).
- **Merge conflict** when opening a step PR: rebase onto latest `<FEATURE_BRANCH>` once. If the conflict isn't trivially resolvable, mark `BLOCKED: merge conflict, needs human` and exit.
- **`gh` or `dex` command errors**: do not paper over. Exit. The next fire is a fresh attempt.

## Hard rules

- Never push to `main`. Only to `<FEATURE_BRANCH>` and step branches.
- Never run `git reset --hard`, `git push --force`, or `git rebase -i`.
- Never modify the dex epic itself (only child tasks).
- Never create a new RemoteTrigger routine. You only call `run` and `update` on your own ID.
- One PR per fire, maximum. If you opened one, you're done.
