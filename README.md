# semantic-loop

A Deno-first TypeScript library for **self-improving retrieval systems** built around a simple loop:

**retrieve → publish → observe → critique → update → retrieve again**

It is designed for edge functions, serverless webhooks, and Postgres/pgvector backends where the function instance stays stateless and the database keeps the memory.

## Why this repo is shaped this way

The best library conventions from 2023–2026 point in the same direction:

- **ESM and web-standard APIs first** (`fetch`, `Request`, `Response`, Web Crypto)
- **Small typed core, adapters at the edge**
- **Config as data**, not hidden singletons
- **Edge-safe orchestration**, heavy work pushed to the database or background jobs
- **Docs generated from exports**, so public types stay explicit and boring in the good way
- **Observability as a default surface**, not an afterthought

This repo leans into those constraints on purpose.

## 2030 view

By 2030, libraries in this category will likely drift toward:

- portable runtimes across Deno / Workers / Bun / Node
- queue-native and durable workflows instead of request-only logic
- telemetry schemas treated like public API
- policy-driven selection loops instead of hard-coded ranking logic
- database-side vector ops + WASM evaluators + thinner application shells

So the core here stays narrow: typed orchestration, explicit interfaces, and swappable adapters.

## Package layout

```txt
semantic-loop/
├─ mod.ts
├─ deno.json
├─ src/
│  ├─ engine.ts
│  ├─ selection.ts
│  ├─ telemetry.ts
│  ├─ types.ts
│  ├─ utils.ts
│  ├─ runtime/
│  │  └─ edge.ts
│  ├─ critics/
│  │  └─ heuristic_critic.ts
│  └─ adapters/
│     ├─ in_memory_store.ts
│     └─ supabase_rpc_store.ts
├─ sql/
│  └─ 001_init.sql
└─ examples/
   └─ supabase-edge/
      └─ index.ts
```

## What the library does

`SemanticLoopEngine` handles two jobs:

1. **Select the next item** from a candidate pool using similarity, historical score, freshness, and exploration pressure.
2. **Ingest outcomes** after publishing, run a critic, compute a final score, and update the aggregate state.

The library does **not** force a specific embedding provider, queue system, or LLM vendor.

## Public concepts

- **SemanticItem**: a stored hook, prompt, angle, or creative unit
- **OutcomeSignal**: what came back from the platform after publishing
- **Critic**: scores quality after observing reality
- **MemoryStore**: where retrieval and aggregate state live
- **SelectionConfig**: how exploration vs exploitation is balanced

## Example

```ts
import {
  deriveEngagementScore,
  HeuristicCritic,
  InMemoryStore,
  SemanticLoopEngine,
  type OutcomeSignal,
  type SemanticItem,
} from "./mod.ts";

const store = new InMemoryStore();
const critic = new HeuristicCritic();
const engine = new SemanticLoopEngine({ store, critic });

const now = new Date().toISOString();
const item: SemanticItem = {
  id: "hook_1",
  tribe: "ai-founders",
  kind: "hook",
  content: "Your moat is not the model, it is the loop that gets smarter after every post.",
  embedding: [0.1, 0.3, 0.5, 0.2],
  metadata: { channel: "reels" },
  createdAt: now,
  updatedAt: now,
};

await engine.seed([item]);

const selected = await engine.selectNext({
  tribe: "ai-founders",
  kind: "hook",
  queryVector: [0.1, 0.29, 0.48, 0.22],
});

const outcome: OutcomeSignal = {
  id: "evt_1",
  itemId: selected.candidate.item.id,
  platform: "instagram",
  occurredAt: new Date().toISOString(),
  metrics: {
    views: 10_000,
    likes: 640,
    comments: 41,
    shares: 28,
    avgWatchSeconds: 17,
  },
  engagementScore: deriveEngagementScore({
    views: 10_000,
    likes: 640,
    comments: 41,
    shares: 28,
    avgWatchSeconds: 17,
  }),
};

const processed = await engine.ingestOutcome(outcome);
console.log(processed.aggregate.scoreAvg);
```

## Selection logic

Each candidate gets a weighted score:

```txt
weighted =
  similarity * w_similarity +
  score_avg * w_score_avg +
  exploration_bonus * w_exploration +
  freshness * w_freshness
```

Then the engine either:

- picks the top candidate greedily, or
- explores from the top-k pool with epsilon probability

This is intentionally simple. In production you can swap in a more exotic selector without rewriting the rest of the loop.

## SQL and pgvector

The `sql/001_init.sql` migration gives you:

- `semantic_items`
- `semantic_item_scores`
- `semantic_outcomes`
- `sl_upsert_item(...)`
- `sl_match_items(...)`
- `sl_record_outcome(...)`
- `sl_apply_outcome(...)`

That is enough to run the loop on Supabase/Postgres with pgvector.

## Edge usage pattern

The clean split is:

- **edge function**: verify webhook, ingest outcome, return fast
- **database**: retrieval, aggregates, vector matching
- **background task / queue**: heavy backfills, re-embedding, large-scale recalibration

That keeps the request path cheap and the stateful learning loop durable.

## License model

This repo ships with **AGPL-3.0-only** for the public codebase and assumes a separate commercial license for teams that want proprietary use.

See `COMMERCIAL.md`.
