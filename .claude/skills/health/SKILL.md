---
name: health
description: This skill should be used when the user asks to "check project health", "run diagnostics", "verify everything works", "is the project healthy", or "run all checks".
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash
---

# Project Health Check

**Quick status:**
- Branch: !`git branch --show-current 2>/dev/null || echo "no git"`
- Uncommitted: !`git status --porcelain 2>/dev/null | wc -l | tr -d ' '` files
- Last commit: !`git log --oneline -1 2>/dev/null || echo "none"`

## Checks (run all sequentially)

### 1. Type Safety
```bash
deno task check
```

### 2. Tests
```bash
deno task test
```

### 3. Formatting
```bash
deno fmt --check
```

### 4. Linting
```bash
deno lint
```

### 5. Export Consistency
- Read `mod.ts` — is every `.ts` file in `src/` exported?
- Are there dangling exports pointing to missing files?

### 6. Boundary Integrity
- Grep `src/` for imports from `pro/` — must be ZERO
- Verify `.gitignore` excludes `/pro/`

### 7. Interface Compliance
- Every `src/adapters/*.ts` exports a class implementing `MemoryStore`?
- Every `src/critics/*.ts` exports a class implementing `Critic`?

### 8. SQL Consistency
- Migrations numbered sequentially?
- RPC parameter names match `supabase_rpc_store.ts`?

### 9. Skill Registry
- All skills in `.claude/skills/` listed in `.claude/CLAUDE.md`?
- All agents in `.claude/agents/` documented?

## Output

```
[PASS] Type safety
[PASS] Tests (1 test, 0 failures)
[WARN] Export consistency — src/foo.ts not in mod.ts
[FAIL] Boundary integrity — src/engine.ts imports from pro/

Summary: 7 passed, 1 warning, 1 failure
```
