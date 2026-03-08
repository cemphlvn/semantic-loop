---
paths:
  - "tests/**/*.ts"
---

# Testing Rules

- Tests use `Deno.test()` with async callbacks
- Import assertions from `jsr:@std/assert`
- Use deterministic `now` and `random` injections — no real clocks or randomness in tests
- Test file naming: `<module>_test.ts` in `tests/` directory
- Each test should seed its own data — no shared mutable state between tests
- Use `InMemoryStore` for unit tests, never real Supabase
- Assert on aggregate state changes, not just return values
- Keep tests focused: one behavior per test function
