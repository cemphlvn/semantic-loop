#!/bin/bash
# Stop hook: run type-check after Claude finishes a response
# Catches type errors early without waiting for manual check

set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Only run if .ts files were modified in this session
CHANGED=$(git diff --name-only HEAD 2>/dev/null | grep '\.ts$' || true)

if [ -n "$CHANGED" ]; then
  if command -v deno &> /dev/null; then
    OUTPUT=$(deno task check 2>&1) || {
      echo "Type check found issues after changes:" >&2
      echo "$OUTPUT" >&2
      exit 0  # Don't block, just inform
    }
  fi
fi

exit 0
