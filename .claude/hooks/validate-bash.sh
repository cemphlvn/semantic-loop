#!/bin/bash
# PreToolUse hook for Bash: block destructive commands
# Exit 2 = block with reason, Exit 0 = allow

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Block destructive patterns
case "$COMMAND" in
  *"rm -rf /"*|*"rm -rf ~"*|*"rm -rf ."*)
    echo "BLOCKED: Destructive rm -rf pattern detected." >&2
    exit 2
    ;;
  *"| bash"*|*"| sh"*)
    echo "BLOCKED: Piping to shell is not allowed." >&2
    exit 2
    ;;
  *"--force"*push*)
    echo "BLOCKED: Force push requires explicit user approval." >&2
    exit 2
    ;;
  *"DROP TABLE"*|*"DROP DATABASE"*|*"TRUNCATE"*)
    echo "BLOCKED: Destructive SQL detected." >&2
    exit 2
    ;;
esac

exit 0
