# semantic-loop

A Deno-first TypeScript library for self-improving retrieval systems.
Core loop: **retrieve → publish → observe → critique → update → retrieve again**.

## Quick Reference

- **Package**: `@semantic-loop/core` v0.1.0
- **Runtime**: Deno (edge-first, web-standard APIs only)
- **License**: AGPL-3.0-only (public), proprietary (`pro/`)
- **Entry**: `mod.ts` re-exports everything from `src/`

## Build & Test

```
deno task check       # Type-check
deno task test        # Run tests
deno task fmt         # Format (semicolons, double quotes, 100-char lines)
deno task lint        # Lint
```

## Architecture

Full architecture decisions, dependency graph, algorithms, and component guides:
@.claude/rules/architecture.md

## Key Modules

| Module | Role |
|--------|------|
| `src/types.ts` | All interfaces — leaf node, zero deps |
| `src/engine.ts` | `SemanticLoopEngine` — select + ingest orchestration |
| `src/selection.ts` | Weighted scoring + epsilon-greedy selection |
| `src/utils.ts` | Cosine similarity, engagement, freshness, clamp |
| `src/errors.ts` | Error hierarchy (leaf node) |
| `src/telemetry.ts` | Swappable observability (`NoopTelemetry` default) |
| `src/breeder.ts` | Pool growth strategy (`NoopBreeder` default) |
| `src/critics/heuristic_critic.ts` | Keyword-based heuristic scorer |
| `src/adapters/in_memory_store.ts` | Map-based store (testing) |
| `src/adapters/supabase_rpc_store.ts` | Supabase/pgvector store |
| `src/runtime/edge.ts` | HMAC verification, JSON helpers |
| `sql/001_init.sql` | Postgres schema + 4 RPC functions |

## Code Conventions

- `readonly` on all interface fields — immutability by default
- `#` private members — true ES private, never `_`
- `async` methods even when sync — adapter interface consistency
- Explicit types on public APIs, inferred on internals
- Named exports only through `mod.ts` — no default exports
- Web-standard APIs only: `fetch`, `Request`, `Response`, `crypto.subtle`
- All scores clamped to `[0, 1]` via `clamp()` from utils

## The `pro/` Directory

Commercial code — tracked in git, proprietary license.
Contains: LLM critic, multi-signal critic, multi-platform adapter, loop analytics, side-quest scaffolds.
**Never import `pro/` from `src/`.** The boundary hook enforces this.

## Hooks (automatic)

These run without manual invocation:
- **SessionStart**: Loads project state (branch, dirty files, module counts)
- **PreToolUse (Write|Edit)**: Blocks `src/` → `pro/` imports
- **PreToolUse (Bash)**: Blocks destructive commands (`rm -rf`, pipe to shell, force push)
- **PostToolUse (Write|Edit)**: Auto-formats `.ts` files with `deno fmt`
- **PostToolUse (Edit)**: Runs `deno check` on edited file, feeds errors back
- **Stop**: Checks for type errors in changed files

## Skills (slash commands)

| Command | Purpose |
|---------|---------|
| **`/project-master`** | **The soul — orients you, guides next moves, remembers and evolves** |
| `/register` | Add a new adapter, critic, skill, agent, module, migration, or test |
| `/improve` | Analyze and fix code quality issues |
| `/evolve` | Generate a new skill/agent/rule — self-evolving development |
| `/discuss` | Architecture, design, and business discussions |
| `/scaffold` | Scaffold a complete side-quest app |
| `/health` | Full project diagnostics (types, tests, lint, boundaries) |
| `/simplify` | Reduce complexity in changed code |

`/project-master` is the soul of this project. It reads `character.md` — a living file with two learning sections:
- **Learnings from the developer** — your truths, never pruned, always verbatim
- **Learnings from the loop** — self-evolving, max 50 entries, oldest pruned when full

## Agents (specialized)

| Agent | Model | Purpose |
|-------|-------|---------|
| `explorer` | haiku | Fast read-only codebase search |
| `reviewer` | inherit | Code review: types, architecture, conventions |
| `architect` | inherit | Design plans with trade-off analysis |
