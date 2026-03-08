---
name: improve
description: This skill should be used when the user asks to "improve code", "optimize performance", "fix type safety", "review quality", "harden the code", or "make it more robust".
argument-hint: [file-or-module] [focus: types|perf|safety|clarity]
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
---

# Improve Existing Code

**Target**: $ARGUMENTS (if empty, analyze all of `src/`)

**Current state:**
- Type check: !`deno task check 2>&1 | tail -5`
- Test results: !`deno task test 2>&1 | tail -5`
- Lint: !`deno lint 2>&1 | tail -5`

## Improvement Dimensions (ranked by priority)

### 1. Correctness (highest)
- Division by zero in averages?
- NaN propagation in score calculations?
- ISO date parsing edge cases (`Date.parse` returns `NaN`)?
- Empty array handling in selection/retrieval?

### 2. Edge Safety
- Any Node.js-specific APIs? Must be web-standard only
- Blocking operations that stall edge functions?
- Unbounded iterations or allocations?

### 3. Type Safety
- All interface fields `readonly`?
- Any `any` types that should be `JsonObject` or specific?
- All scores clamped to `[0, 1]`?
- Missing return types on public methods?

### 4. Performance
- Unnecessary allocations in hot paths (selection scoring)?
- Short-circuit opportunities in loops?
- Map lookups vs array scans?

### 5. Clarity (lowest)
- Self-documenting function names?
- Magic numbers → named constants?
- Complex expressions → named intermediates?

## Process

1. Read the target file(s) completely
2. Identify improvements by dimension
3. **Apply** the top improvements (don't just suggest — fix)
4. Run `deno task check` and `deno task test`
5. Report: what changed, why, which dimension
