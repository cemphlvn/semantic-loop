---
paths:
  - "src/**/*.ts"
  - "mod.ts"
---

# Code Style

- Semicolons required, double quotes, 100-char line width (deno fmt config)
- All public interface fields are `readonly`
- Private members use `#` prefix (ES private fields), never `_`
- Named exports only — no default exports
- Explicit return types on all public methods
- Use `readonly` arrays in interfaces: `readonly string[]` or `readonly T[]`
- Prefer `for...of` over `.forEach()` for iteration
- Use `??` for nullish coalescing, never `||` for defaults
- Import types with `import type` when only used as types
- Keep functions pure where possible — no side effects in utils
- Barrel export everything through `mod.ts`
