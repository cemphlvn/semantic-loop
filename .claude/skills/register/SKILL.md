---
name: register
description: This skill should be used when the user asks to "register a new component", "add an adapter", "add a critic", "create a new skill", "create a new agent", "add a module", "add a migration", or "add a test".
argument-hint: <type> <name> [description]
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Register a New Component

**Arguments**: $ARGUMENTS

**Current project state:**
- Existing exports: !`grep 'export' mod.ts`
- Existing adapters: !`ls src/adapters/`
- Existing critics: !`ls src/critics/`
- Existing skills: !`ls .claude/skills/`
- Existing agents: !`ls .claude/agents/`
- Existing tests: !`ls tests/`
- Existing migrations: !`ls sql/`

Parse the arguments to determine:
- **type**: one of `adapter`, `critic`, `skill`, `module`, `migration`, `test`, `agent`
- **name**: the component name (snake_case for code, kebab-case for skills/agents)
- **description**: optional one-line description

## Registration Procedures

### adapter
1. Read `src/types.ts` — get the `MemoryStore` interface (all 6 methods)
2. Create `src/adapters/<name>_store.ts` implementing every method
3. Use `readonly` fields, `#` private members, `async` methods
4. Import types with `import type`, utils from `../utils.ts`
5. Add `export * from "./src/adapters/<name>_store.ts";` to `mod.ts`
6. Create `tests/<name>_store_test.ts` with seed → select → ingest cycle
7. Run `deno task check`

### critic
1. Read `src/types.ts` — get the `Critic` interface (single `score` method)
2. Create `src/critics/<name>_critic.ts`
3. `score(input: CriticInput): Promise<CriticResult>` — return `[0,1]` via `clamp()`
4. Add export to `mod.ts`
5. Create `tests/<name>_critic_test.ts`
6. Run `deno task check`

### skill
1. Create `.claude/skills/<name>/SKILL.md`
2. Include frontmatter: `name`, `description` with trigger phrases, `argument-hint`, `user-invocable: true`, `allowed-tools`
3. Write instructions using `$ARGUMENTS` for input and `!` backtick for dynamic context
4. Update "Available Skills" in `.claude/CLAUDE.md`

### agent
1. Create `.claude/agents/<name>/AGENT.md`
2. Include frontmatter: `name`, `description` with `<example>` blocks, `model`, `color`, `tools`
3. Write focused system prompt with role, workflow, output format

### module
1. Create `src/<name>.ts`
2. Add export to `mod.ts`
3. Create `tests/<name>_test.ts`
4. Run `deno task check`

### migration
1. Find highest number: !`ls sql/ | sort -r | head -1`
2. Create `sql/<next>_<name>.sql`
3. Use `public` schema, `sl_` prefix, `on conflict` for idempotency

### test
1. Create `tests/<name>_test.ts`
2. Use `Deno.test()`, import from `../mod.ts`
3. Use `InMemoryStore`, deterministic `now`/`random`
4. Run `deno task test`

After registration, run `deno task check` and confirm what was created.
