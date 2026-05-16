#!/usr/bin/env bash
# AFK fire — one implement-only worker fire.
#
# Spawns a single fresh headless `claude -p` (or `codex exec`) that executes
# decision rule 4 of worker.md ONLY: pick the next pending dex task, implement
# it, open a step PR into the feature branch, mark the task in-progress.
#
# It deliberately does NOT merge PRs, watch CI, reconcile dex state, or open the
# integration PR — those are the orchestrator's job (the Claude Code thread that
# launched /afk-local, or scripts/afk-loop.sh for unattended runs).
#
# Usage:
#   ./scripts/afk-fire.sh <epic-id>
#
# Env knobs:
#   AFK_WORKER   which CLI runs the fire: "claude" (default) or "codex"
#
# Exit status is the worker CLI's exit status. A fresh context every fire — no
# compaction, predictable cost. This is the stateless-fire primitive; the
# orchestrator loops over it.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

FEATURE_BRANCH="$(git branch --show-current)"
if [[ ! "$FEATURE_BRANCH" =~ ^claude/feat- ]]; then
  echo "Error: not on a claude/feat-* branch (currently: $FEATURE_BRANCH)" >&2
  echo "       Switch to your feature branch and try again." >&2
  exit 1
fi

EPIC_ID="${1:-}"
if [[ -z "$EPIC_ID" ]]; then
  echo "Error: epic ID required." >&2
  echo "       Usage: ./scripts/afk-fire.sh <epic-id>" >&2
  exit 1
fi

OWNER_REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
AFK_WORKER="${AFK_WORKER:-claude}"

case "$AFK_WORKER" in
  claude|codex) ;;
  *)
    echo "Error: AFK_WORKER must be 'claude' or 'codex' (got: $AFK_WORKER)" >&2
    exit 1
    ;;
esac

if ! command -v "$AFK_WORKER" >/dev/null 2>&1; then
  echo "Error: '$AFK_WORKER' CLI is not on PATH." >&2
  exit 1
fi

# Start the fire from a clean checkout of the feature branch.
git switch "$FEATURE_BRANCH" >/dev/null 2>&1 || true
git fetch origin "$FEATURE_BRANCH" >/dev/null 2>&1 || true
git reset --hard "origin/$FEATURE_BRANCH" >/dev/null 2>&1 || true

# read -d '' (rather than $(cat <<EOF)) keeps this robust on macOS bash 3.2,
# which mis-parses heredocs nested in command substitution. read returns
# non-zero at EOF, hence `|| true`.
IFS= read -r -d '' PROMPT <<EOF || true
You are an AFK feature worker (local mode, implement-only fire).

Repo: $OWNER_REPO
Feature branch: $FEATURE_BRANCH
Dex epic: $EPIC_ID

Do this and only this:

1. git fetch origin
2. git switch $FEATURE_BRANCH -- if it no longer exists, exit cleanly: the feature is shipped or aborted.
3. Read .claude/skills/afk-feature/worker.md from the working tree.
4. Execute ONLY decision rule 4 -- "Start the next pending task" -- of that
   decision tree, with the variables above substituted.
   - Do NOT execute rules 1, 2, or 3. The orchestrator owns merging step PRs,
     reconciling dex state, and opening the integration PR.
   - If no pending task is available to start -- every child task is completed,
     in-progress, or BLOCKED -- exit cleanly without doing anything.
   - Skip every "RemoteTrigger run" / "RemoteTrigger update" instruction -- this
     is a local shell loop, not a routine.

Implement exactly one task, open exactly one step PR into $FEATURE_BRANCH, mark
the task in-progress in dex, and exit. Never merge a PR. Never watch CI. Never
open the integration PR. Do not refactor outside the task's scope. One PR per
fire, maximum.
EOF

case "$AFK_WORKER" in
  claude)
    claude -p "$PROMPT" \
      --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
      --dangerously-skip-permissions
    ;;
  codex)
    # --dangerously-bypass-approvals-and-sandbox: --full-auto's workspace-write
    # sandbox blocks writes to .git/ so the worker can't `git switch -c` a step
    # branch. Matches --dangerously-skip-permissions passed to claude.
    # -c 'mcp_servers={}': wipe user-level MCP servers so codex doesn't hang on
    # their handshake.
    codex exec \
      --dangerously-bypass-approvals-and-sandbox \
      -c 'mcp_servers={}' \
      "$PROMPT"
    ;;
esac
