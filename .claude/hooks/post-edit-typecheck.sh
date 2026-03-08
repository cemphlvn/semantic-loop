#!/bin/bash
# PostToolUse hook for Edit: run incremental type check on .ts files
# Runs after each edit to catch type errors early

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only typecheck .ts files
case "$FILE_PATH" in
  *.ts)
    cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
    if command -v deno &> /dev/null; then
      OUTPUT=$(deno check "$FILE_PATH" 2>&1) || {
        echo "Type error in $FILE_PATH:" >&2
        echo "$OUTPUT" >&2
        exit 2  # Feed back to Claude so it can fix
      }
    fi
    ;;
esac

exit 0
