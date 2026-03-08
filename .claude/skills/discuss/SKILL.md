---
name: discuss
description: This skill should be used when the user asks to "discuss architecture", "think about design", "evaluate trade-offs", "consider options", "plan the roadmap", or "debate a decision".
argument-hint: <topic> [context]
user-invocable: true
allowed-tools: Read, Glob, Grep, Agent
---

# Discuss

**Topic**: $ARGUMENTS

**Current project state:**
- Modules: !`ls src/`
- Pro modules: !`ls pro/ 2>/dev/null || echo "no pro/"`
- Recent changes: !`git log --oneline -5 2>/dev/null || echo "no git history"`

## Discussion Mode

This is a thinking partner session, not an implementation task.

1. **Read relevant code first** — ground every point in the actual codebase
2. **Present trade-offs**, not just recommendations
3. **Reference architecture** — read `.claude/rules/architecture.md`
4. **Think in horizons**:
   - 2026: Single loop, single signal source
   - 2027: Multi-loop composition, cross-platform signals
   - 2028: Autonomous sub-loops, LLM critics that hypothesize
   - 2029: Loop marketplaces, pre-trained loops as tradeable units
5. **Consider the commercial boundary** — does this affect public/pro split?

## Output Structure

### Context
What I found in the codebase that's relevant.

### Options
2-3 approaches with concrete trade-offs:
- **Option A**: [description] — Pro: ... Con: ...
- **Option B**: [description] — Pro: ... Con: ...

### Recommendation
Preferred path and why, with the horizon considered.

### Open Questions
What needs more information before deciding.
