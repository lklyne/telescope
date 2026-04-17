#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_URL="https://raw.githubusercontent.com/vercel-labs/agent-browser/main/skills/agent-browser/SKILL.md"
DEST="resources/skills/agent-browser/SKILL.md"

echo "Fetching agent-browser SKILL.md from upstream..."
curl -fsSL "$UPSTREAM_URL" -o "$DEST"
echo "Updated $DEST ($(wc -c < "$DEST" | tr -d ' ') bytes)"
