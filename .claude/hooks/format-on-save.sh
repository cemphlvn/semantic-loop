#!/bin/bash
# PostToolUse hook: auto-format TypeScript files after Write/Edit
# Reads tool input from stdin to get the file path

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only format .ts files in this project
case "$FILE_PATH" in
  *.ts)
    if command -v deno &> /dev/null; then
      deno fmt --quiet "$FILE_PATH" 2>/dev/null || true
    fi
    ;;
esac

exit 0
