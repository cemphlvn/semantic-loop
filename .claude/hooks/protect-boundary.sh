#!/bin/bash
# PreToolUse hook: prevent src/ from importing pro/
# Uses structured JSON output for proper Claude integration
# Exit 2 = deny with reason fed back to Claude

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty' 2>/dev/null)
NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ] || [ -z "$NEW_CONTENT" ]; then
  exit 0
fi

# Only check src/ and mod.ts files
case "$FILE_PATH" in
  */src/*.ts|*/mod.ts)
    if echo "$NEW_CONTENT" | grep -qE 'from\s+["\x27].*pro/' 2>/dev/null; then
      # Structured output: deny with reason
      cat <<'EOF' >&2
BLOCKED: Public code (src/) must not import from commercial code (pro/).

The boundary is one-way:
  pro/ → src/  ✓  (commercial extends public)
  src/ → pro/  ✗  (would create proprietary dependency)

Move the shared logic to src/ or create an interface in src/types.ts that pro/ implements.
EOF
      exit 2
    fi
    ;;
esac

exit 0
