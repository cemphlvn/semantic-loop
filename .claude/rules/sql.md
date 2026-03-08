---
paths:
  - "sql/**/*.sql"
---

# SQL Rules

- All objects in `public` schema
- Function prefix: `sl_`
- Use `on conflict` for idempotent upserts
- Use `coalesce()` for nullable fallbacks
- Row-level locking (`for update`) on aggregate updates
- Column names: snake_case (mapped to camelCase in TypeScript adapters)
- Migrations numbered sequentially: `001_init.sql`, `002_<name>.sql`
- Vector columns use `vector(1536)` default — note in comments if different dimensionality needed
- Always include index definitions in the same migration as the table
