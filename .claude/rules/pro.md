---
paths:
  - "pro/**/*.ts"
---

# Commercial Code Rules

- `pro/` code may import from `src/` (public interfaces)
- `src/` code must NEVER import from `pro/`
- Commercial modules implement the same interfaces (`Critic`, `MemoryStore`)
- Each skill scaffold must generate a standalone, deployable edge function
- Skill generators are pure functions: config in, string out
- LLM API calls use `fetch` directly — no SDK dependencies
- Always handle LLM parsing failures gracefully with fallback scores
- Keep the public/commercial boundary clean — no leaky abstractions
