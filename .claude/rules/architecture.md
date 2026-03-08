# Architecture

## Design Principles

1. **Stateless edge, stateful database** — The function instance holds no memory. The database keeps the learning loop durable. Every method on `SemanticLoopEngine` is a pure request-response cycle against the store.

2. **Config as data** — No hidden singletons, no global state. Everything flows through `EngineOptions`. Selection weights, aggregation config, epsilon — all explicit, all overridable per call.

3. **Small typed core, adapters at the edge** — The core library defines interfaces (`MemoryStore`, `Critic`, `Telemetry`). Adapters implement them. The core never imports an adapter.

4. **Scores are always [0, 1]** — Every score in the system is clamped. Engagement scores, critic scores, final scores, weighted scores. No unbounded numerics.

5. **Readonly interfaces** — All type contracts use `readonly`. Data flows through the system without mutation. New state is computed, not patched.

## Module Dependency Graph

```
mod.ts (barrel)
  ├── types.ts         (zero deps — leaf)
  ├── errors.ts        (zero deps — leaf)
  ├── utils.ts         (imports types.ts)
  ├── selection.ts     (imports types.ts, utils.ts)
  ├── engine.ts        (imports types.ts, errors.ts, utils.ts, selection.ts, telemetry.ts)
  ├── telemetry.ts     (imports types.ts)
  ├── critics/
  │   └── heuristic_critic.ts  (imports types.ts, utils.ts)
  ├── adapters/
  │   ├── in_memory_store.ts       (imports types.ts, utils.ts)
  │   └── supabase_rpc_store.ts    (imports types.ts, utils.ts)
  └── runtime/
      └── edge.ts      (imports types.ts)
```

No circular dependencies. `types.ts` and `errors.ts` are leaf nodes.

## The Selection Algorithm

Candidates are scored with four weighted dimensions:

```
weighted = similarity × 0.45
         + scoreAvg   × 0.35
         + exploration × 0.15
         + freshness   × 0.05
```

- **similarity**: cosine similarity (normalized to [0,1]) between query vector and item embedding
- **scoreAvg**: running average of final scores from past outcomes
- **exploration**: `1 / (attempts + 1)` — encourages untested items
- **freshness**: exponential decay from last outcome, half-life 168 hours

Selection is **epsilon-greedy**: with probability ε (default 0.18), pick randomly from top-k pool instead of best.

## The Aggregation Algorithm

When an outcome arrives:

1. Critic scores the item (heuristic or LLM-based)
2. Final score = `criticScore × 0.6 + engagementScore × 0.4`
3. Aggregate update applies **decay**: `scoreSum = oldScoreSum × decayFactor + finalScore`
4. Running averages recomputed: `scoreAvg`, `criticAvg`, `engagementAvg`

Decay factor (default 0.95) ensures recent performance matters more than ancient history.

## Engagement Score Derivation

```
interactionRate = (likes + comments×2 + shares×3 + saves×2 + clicks×2 + conversions×4) / views
watchSignal     = clamp(avgWatchSeconds / 30)
engagementScore = interactionRate × 0.7 + watchSignal × 0.3
```

Weighted to value deep engagement (comments, shares, watch time) over passive signals (views, likes).

## Database Schema (pgvector)

Three tables:
- `semantic_items` — content with embedding vectors (ivfflat index, cosine ops)
- `semantic_item_scores` — aggregate state per item
- `semantic_outcomes` — raw outcome events with critic data

Four RPC functions handle all writes:
- `sl_upsert_item` — idempotent insert/update
- `sl_match_items` — vector similarity search with filtering
- `sl_record_outcome` — append outcome event
- `sl_apply_outcome` — atomic aggregate update with row-level locking

## Adding New Components

### New Adapter
1. Create `src/adapters/<name>_store.ts`
2. Implement `MemoryStore` interface from `types.ts`
3. Export from `mod.ts`
4. Map between your backend's naming and the camelCase type contracts

### New Critic
1. Create `src/critics/<name>_critic.ts`
2. Implement `Critic` interface — single method: `score(CriticInput): Promise<CriticResult>`
3. Export from `mod.ts`
4. Score must return [0, 1], rationale string, and tags array

### New SQL Migration
1. Create `sql/<number>_<description>.sql`
2. Keep functions in `public` schema with `sl_` prefix
3. Use `on conflict` for idempotency
4. Match column names to `RpcMatchRow` / `RpcAggregateRow` interfaces in supabase adapter

## Error Handling

Three error classes, all extend `SemanticLoopError`:
- `ValidationError` — bad input (missing fields, invalid scores)
- `NotFoundError` — item or candidate not found
- `SemanticLoopError` — base class for catch-all

Adapters throw native errors for infrastructure failures (network, DB).
The engine catches nothing — errors propagate to the caller.

## Telemetry Contract

The `Telemetry` interface is intentionally minimal: `startSpan(name) → SpanLike`.
`SpanLike` has `setAttribute(name, value)` and `end()`.

This maps to OpenTelemetry, Datadog, or any tracing provider.
Default is `NoopTelemetry` — zero overhead when not configured.

## Commercial Boundary

Public (`src/`):
- Core engine, types, errors, utils
- Heuristic critic (keyword-based)
- In-memory store, Supabase RPC store
- Edge runtime helpers

Commercial (`pro/`):
- LLM critic (Claude/GPT as judge)
- Multi-signal critic (compose N critics)
- Multi-platform store (cross-platform normalization)
- Loop analytics (health reports, convergence detection)
- Side-quest scaffold skills
