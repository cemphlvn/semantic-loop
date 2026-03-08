---
name: scaffold
description: This skill should be used when the user asks to "scaffold an app", "create a side-quest", "generate a new project", "build a hook optimizer", "build a copy loop", or "scaffold a taste engine".
argument-hint: <category> [config-overrides]
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Scaffold a Side-Quest

**Category**: $ARGUMENTS

**Available scaffolds:**
- Skill files: !`ls pro/skills/ 2>/dev/null || echo "no pro/skills/"`

## Categories

| Category | Source | Domain |
|----------|--------|--------|
| `hook-optimizer` | `pro/skills/scaffold-hook-optimizer.ts` | Creator content optimization |
| `copy-loop` | `pro/skills/scaffold-copy-loop.ts` | Conversion copy improvement |
| `smart-feed` | `pro/skills/scaffold-smart-feed.ts` | Self-curating content feed |
| `adaptive-template` | `pro/skills/scaffold-adaptive-template.ts` | Learning workflow templates |
| `taste-engine` | `pro/skills/scaffold-taste-engine.ts` | Personal recommendation engine |
| `prompt-loop` | `pro/skills/scaffold-prompt-loop.ts` | Self-improving prompt library |
| `custom` | (guided creation) | Any new domain |

## Process

1. Read the corresponding skill file from `pro/skills/`
2. Ask for config overrides (or use defaults)
3. Generate the project:
   ```
   examples/<category>/
   ├── index.ts          # Deno.serve edge function
   ├── seed.ts           # Starter data with placeholder embeddings
   └── README.md         # Setup instructions
   ```
4. Verify: `deno check examples/<category>/index.ts`

## Custom Category

If category is `custom`, guide through:
1. **Domain** — what do items represent?
2. **Signals** — what outcomes look like?
3. **Quality** — how to score? (heuristic keywords, LLM judge, metrics-only)
4. **Selection bias** — high exploration (discovery) or high exploitation (optimization)?
5. Generate following existing scaffold patterns
