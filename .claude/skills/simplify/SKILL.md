---
name: simplify
description: This skill should be used when the user asks to "simplify code", "reduce complexity", "clean up changes", "review for quality", or "remove unnecessary code".
argument-hint: [file-or-branch]
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Edit
---

# Simplify

**Target**: $ARGUMENTS (if empty, review all uncommitted changes)

**Changes to review:**
- Uncommitted diff: !`git diff --stat 2>/dev/null || echo "no changes"`

## Review Criteria

1. **Duplication** — Repeated logic that should use an existing utility from `src/utils.ts`?
2. **Over-engineering** — Abstractions not needed yet? Config for one use case?
3. **Dead code** — Unused imports, unreachable branches, commented-out code?
4. **Complexity** — Nested conditionals that can flatten? Loops that can be map/filter?
5. **Naming** — Do names communicate intent without needing a comment?
6. **Consistency** — Does new code follow patterns in adjacent code?

## Process

1. Get the diff (or read target file)
2. For each changed file, read the full file for context
3. Identify simplification opportunities
4. **Apply fixes directly** — don't just suggest
5. Run `deno task check` to verify
6. Report what was simplified and why
