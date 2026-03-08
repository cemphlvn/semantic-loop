#!/bin/bash
# SessionStart hook: Load project state and context at session start
# stdout goes into Claude's context as a system message

set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

echo "=== semantic-loop session ==="

# Git state
BRANCH=$(git branch --show-current 2>/dev/null || echo "no-git")
DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
LAST_COMMIT=$(git log --oneline -1 2>/dev/null || echo "no commits")
echo "Branch: $BRANCH | Uncommitted: $DIRTY files | Last: $LAST_COMMIT"

# Type check status (fast, cached)
if command -v deno &> /dev/null; then
  if deno task check 2>&1 | grep -q "error"; then
    echo "⚠ Type errors detected — run /health to investigate"
  fi
fi

# Module count
SRC_COUNT=$(find src -name '*.ts' 2>/dev/null | wc -l | tr -d ' ')
PRO_COUNT=$(find pro -name '*.ts' 2>/dev/null | wc -l | tr -d ' ')
TEST_COUNT=$(find tests -name '*.ts' 2>/dev/null | wc -l | tr -d ' ')
SKILL_COUNT=$(find .claude/skills -name 'SKILL.md' 2>/dev/null | wc -l | tr -d ' ')
AGENT_COUNT=$(find .claude/agents -name 'AGENT.md' 2>/dev/null | wc -l | tr -d ' ')
echo "Modules: $SRC_COUNT src | $PRO_COUNT pro | $TEST_COUNT tests | $SKILL_COUNT skills | $AGENT_COUNT agents"

exit 0
