#!/usr/bin/env bash
# AFK feature loop — runs fresh `claude -p` sessions in a tight loop, each
# executing one fire of the AFK worker decision tree.
#
# Usage:
#   ./scripts/afk-loop.sh                 # auto-detect epic from dex
#   ./scripts/afk-loop.sh <epic-id>       # explicit epic ID
#
# Env knobs:
#   MAX_FIRES        max iterations before stopping (default 20)
#   SLEEP_SECONDS    seconds to sleep between fires (default 5)
#   AFK_WORKER       which CLI runs each fire: "claude" (default) or "codex"
#
# Stop with Ctrl+C. Each fire is a fresh context — no compaction, predictable cost.
# This is the local equivalent of the cloud worker routine, without the 1h cron floor.

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
  EPIC_ID="$(dex list --json | python3 -c '
import sys, json
data = json.load(sys.stdin)
for t in data:
    if t.get("parent_id") is None and t.get("children") and not t.get("completed"):
        print(t["id"])
        break
')"
fi

if [[ -z "$EPIC_ID" ]]; then
  echo "Error: could not auto-detect a pending epic from dex." >&2
  echo "       Pass it as arg 1: ./scripts/afk-loop.sh <epic-id>" >&2
  exit 1
fi

OWNER_REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
MAX_FIRES="${MAX_FIRES:-20}"
SLEEP_SECONDS="${SLEEP_SECONDS:-5}"
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

echo "=== AFK loop ==="
echo "Repo:           $OWNER_REPO"
echo "Feature branch: $FEATURE_BRANCH"
echo "Epic:           $EPIC_ID"
echo "Worker:         $AFK_WORKER"
echo "Max fires:      $MAX_FIRES"
echo "Sleep between:  ${SLEEP_SECONDS}s"
echo ""

PROMPT=$(cat <<EOF
You are an AFK feature worker (local mode).

Repo: $OWNER_REPO
Feature branch: $FEATURE_BRANCH
Dex epic: $EPIC_ID

Do this and only this:

1. git fetch origin
2. git switch $FEATURE_BRANCH (if it no longer exists, exit cleanly — feature is shipped or aborted)
3. Read .claude/skills/afk-feature/worker.md from the working tree
4. Follow its decision tree exactly ONCE, with the variables above substituted.
   - Skip every "RemoteTrigger run <SELF_ROUTINE_ID>" and "RemoteTrigger update" instruction in worker.md — we are running in a local shell loop, not a routine.

Exit when you have done one unit of work (opened/merged one PR, advanced one tasks state, or determined there is nothing to do).

Do not invent extra work. Do not refactor outside the current steps scope. One PR per fire, max.
EOF
)

for i in $(seq 1 "$MAX_FIRES"); do
  echo "=== Fire $i/$MAX_FIRES — $(date -u +%H:%M:%SZ) ==="

  # Always start a fire on the feature branch
  git switch "$FEATURE_BRANCH" >/dev/null 2>&1 || true
  git fetch origin "$FEATURE_BRANCH" >/dev/null 2>&1 || true
  git reset --hard "origin/$FEATURE_BRANCH" >/dev/null 2>&1 || true

  case "$AFK_WORKER" in
    claude)
      if ! claude -p "$PROMPT" \
          --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
          --dangerously-skip-permissions; then
        echo "claude -p exited non-zero, stopping" >&2
        exit 1
      fi
      ;;
    codex)
      if ! codex exec --full-auto "$PROMPT"; then
        echo "codex exec exited non-zero, stopping" >&2
        exit 1
      fi
      ;;
  esac

  echo ""

  # Check if epic is now complete. Two exit paths:
  #   1. dex marks the epic completed (only happens after integration PR merges)
  #   2. Every child task is completed AND an integration PR is open against main
  #      (the worker can't merge the integration PR itself — that's the human's job —
  #      so once it's open, every further fire is a no-op and we should stop early)
  EPIC_STATE="$(dex show "$EPIC_ID" --json 2>/dev/null | python3 -c '
import sys, json
try:
    t = json.load(sys.stdin)
    if t.get("completed"):
        print("done")
    else:
        children = t.get("subtasks", {}).get("children", []) or t.get("children", [])
        if children and all(c.get("completed") for c in children):
            print("children-done")
        else:
            print("in-progress")
except Exception:
    print("in-progress")
')"

  if [[ "$EPIC_STATE" == "done" ]]; then
    echo "✓ Epic $EPIC_ID complete. Loop done."
    exit 0
  fi

  if [[ "$EPIC_STATE" == "children-done" ]]; then
    INTEGRATION_PR="$(gh pr list --head "$FEATURE_BRANCH" --base main --state open --json number -q '.[0].number' 2>/dev/null || true)"
    if [[ -n "$INTEGRATION_PR" ]]; then
      echo "✓ All child tasks complete; integration PR #$INTEGRATION_PR is open against main. Loop done."
      exit 0
    fi
  fi

  echo "Sleeping ${SLEEP_SECONDS}s before next fire..."
  sleep "$SLEEP_SECONDS"
done

echo "Reached MAX_FIRES=$MAX_FIRES without completing the epic. Stopping."
