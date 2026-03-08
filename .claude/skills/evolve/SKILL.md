---
name: evolve
description: This skill should be used when the user asks to "generate a new skill", "create a command", "make development easier", "evolve the project", "add a workflow", or "self-improve the development process".
argument-hint: <what-should-be-easier> [--generate]
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Evolve: Self-Improving Development Architecture

**Request**: $ARGUMENTS

The developer programs the commands that develop the repository. This skill creates new skills, agents, or rules that make future development sessions more effective.

**Current inventory:**
- Skills: !`ls .claude/skills/`
- Agents: !`ls .claude/agents/`
- Rules: !`ls .claude/rules/`

## How Evolution Works

```
Developer describes friction
      |
      v
Analyze: what's repetitive, complex, or error-prone?
      |
      v
Survey existing skills/agents — avoid duplication
      |
      v
Design the new component (skill, agent, or rule)
      |
      v
Create it with proper frontmatter + instructions
      |
      v
Register in CLAUDE.md
      |
      v
Verify it works
```

## What Can Be Evolved

| Type | When | Output |
|------|------|--------|
| **Skill** | User-invoked action (slash command) | `.claude/skills/<name>/SKILL.md` |
| **Agent** | Complex multi-step process needing isolation | `.claude/agents/<name>/AGENT.md` |
| **Rule** | Always-on constraint or convention | `.claude/rules/<name>.md` |

## Skill Design Principles

- **Concrete triggers** — Description includes exact phrases: "when the user asks to..."
- **Dynamic context** — Use `!` backtick for shell commands that inject live state
- **$ARGUMENTS driven** — Parse user input for flexibility
- **Self-contained** — Include all context needed via file reads
- **Verifiable** — End with a check step (type check, test, lint)
- **Under 500 lines** — Keep focused, split if growing

## Agent Design Principles

- **`<example>` blocks** in description for reliable triggering
- **`color` field** for visual distinction
- **`tools` restricted** to what the agent actually needs
- **Clear boundaries** — what it does AND what it does NOT do
- **Structured output** — define the format the agent returns

## Rule Design Principles

- **Path-scoped** with frontmatter `paths:` when applicable
- **Concise** — bullets, not paragraphs
- **Enforceable** — can be verified by a hook or check

## Meta-Evolution

If similar skills keep being generated, suggest:
- Can these be parameterized into one skill?
- Should there be a new agent that handles the whole category?
- Is this a signal that a hook should enforce this automatically?

The `.claude/skills/` directory is the project's development API. It should grow as the project grows.

## Output

1. Create the component file with proper frontmatter
2. Update `.claude/CLAUDE.md` available skills/agents section
3. Report what was created and how to use it
