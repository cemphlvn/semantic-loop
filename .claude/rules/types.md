---
paths:
  - "src/types.ts"
---

# Type System Rules

- `types.ts` is a leaf module — it imports nothing from the project
- All interfaces use `readonly` on every field
- Use `EmbeddingVector = readonly number[]` for embeddings
- JSON types: `JsonPrimitive`, `JsonValue`, `JsonObject` — use these instead of `any`
- Optional fields use `?` suffix, never `| undefined`
- ISO 8601 strings for all dates (`createdAt`, `updatedAt`, `occurredAt`)
- Contract interfaces (`MemoryStore`, `Critic`, `Telemetry`) define the plugin boundary
- When adding a new interface, consider: does it need to be in types.ts (shared) or local to its module?
