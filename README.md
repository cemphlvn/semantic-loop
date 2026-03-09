<div align="center">

# semantic-loop

**Typed orchestration for self-improving retrieval systems.**

Seed content. Select the best. Observe what happens. Feed it back. The loop gets smarter every cycle.

[Website](https://cemphlvn.github.io/semantic-loop) ·
[Quickstart](https://cemphlvn.github.io/semantic-loop/docs/quickstart.html) ·
[API Reference](https://cemphlvn.github.io/semantic-loop/docs/api.html) ·
[Supabase Guide](https://cemphlvn.github.io/semantic-loop/docs/supabase.html)

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Deno](https://img.shields.io/badge/runtime-Deno-000?logo=deno)](https://deno.com)
[![TypeScript](https://img.shields.io/badge/types-TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

</div>

---

```ts
import { createLoop } from "@semantic-loop/core";

const loop = createLoop({ store: "supabase", embedding: "openai" });

await loop.seed([
  { content: "The moat is the loop that compounds.", tribe: "founders" },
]);

const pick = await loop.select("compounding growth strategies");

await loop.ingest(pick.candidate.item.id, "instagram", {
  views: 12400, likes: 340, shares: 89,
});
// Next select() is smarter. Every loop compounds.
```

## What is this?

A Deno-first library that turns any content — hooks, prompts, copy, templates — into a self-improving system. You seed items, the engine selects the best one for a given context, real-world outcomes flow back, and the system learns what works. When items perform well, an optional breeder generates variations — the pool grows from what works.

```
seed → select → publish → observe → ingest → select again
         ↑                                        |
         └────────── the loop that compounds ──────┘
```

Three methods. One feedback loop. Deploy to any edge runtime.

## Quickstart

```bash
deno add jsr:@semantic-loop/core
```

```ts
import { createLoop } from "@semantic-loop/core";

// In-memory — no external services needed
const loop = createLoop({ store: "memory" });

await loop.seed([
  { content: "Why most founders build features when they should build feedback loops." },
  { content: "Generic productivity advice." },
  { content: "The moat is the loop that compounds after every post." },
]);

// Select best candidate
const pick = await loop.select();
console.log(pick.candidate.item.content);

// Simulate real-world outcome
const result = await loop.ingest(pick.candidate.item.id, "instagram", {
  views: 12400, likes: 340, comments: 45, shares: 89,
});
console.log(result.finalScore); // 0.341

// Select again — now informed by the outcome
const next = await loop.select();
// → picks the item that performed, not random
```

> Run it: `deno run examples/quickstart.ts`

## Configuration

`createLoop()` takes a declarative config. String shorthands for the fast path, full objects for control, raw instances for escape hatches.

**Minimal (local dev)**

```ts
const loop = createLoop({ store: "memory" });
```

**Production (Supabase + OpenAI)**

```ts
const loop = createLoop({
  store: "supabase",      // reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
  embedding: "openai",    // reads OPENAI_API_KEY
});
```

**Tuned (content optimization)**

```ts
const loop = createLoop({
  store: {
    provider: "supabase",
    url: Deno.env.get("SUPABASE_URL")!,
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  },
  embedding: {
    provider: "openai",
    apiKey: Deno.env.get("OPENAI_API_KEY")!,
    model: "text-embedding-3-small",
  },
  critic: {
    provider: "heuristic",
    noveltyKeywords: ["why", "mistake", "counterintuitive"],
    penaltyKeywords: ["viral", "guaranteed"],
  },
  selection: {
    epsilon: 0.2,
    freshnessHalfLifeHours: 48,
    weights: { similarity: 0.35, scoreAvg: 0.4, exploration: 0.15, freshness: 0.1 },
  },
  aggregation: { decayFactor: 0.9 },
});
```

Every config slot accepts a string shorthand, a typed config object, or a raw interface implementation. No ceiling.

## Supabase Setup

1. Create a Supabase project
2. Run the migration in the SQL Editor:

```sql
-- sql/001_init.sql creates:
--   semantic_items (with pgvector embeddings)
--   semantic_item_scores (aggregate state)
--   semantic_outcomes (raw events)
--   4 RPC functions: sl_upsert_item, sl_match_items, sl_record_outcome, sl_apply_outcome
```

3. Set environment variables:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-key
OPENAI_API_KEY=sk-...  # optional, for embeddings
```

4. Use it:

```ts
const loop = createLoop({ store: "supabase", embedding: "openai" });
```

## What you can build

| App | What it does | Loop signal |
|-----|-------------|-------------|
| **Hook Optimizer** | Rotate content hooks per audience, surface what lands | views, shares, saves |
| **Prompt Loop** | Self-improving prompt variants per task type | success rate, user rating |
| **Copy Variants** | Headlines, CTAs, email subjects that converge on what converts | clicks, conversions |
| **Taste Engine** | Personal recommendations that sharpen over time | accept/reject, ratings |
| **Smart Feed** | Self-curating content feeds | click, read-time, save |
| **Adaptive Templates** | Proposals and emails that evolve toward what wins | win/loss, completion rate |

Each is a single edge function backed by one Supabase project.

## Interfaces

The core defines five contracts. Swap any part.

| Interface | What it does | Ships with |
|-----------|-------------|------------|
| **MemoryStore** | Where items and scores live | `InMemoryStore`, `SupabaseRpcStore` |
| **Critic** | How content is judged after an outcome | `HeuristicCritic` |
| **EmbeddingProvider** | Turns text into vectors | `OpenAIEmbedding`, `NoopEmbedding` |
| **Breeder** | How the pool grows from winners | `NoopBreeder` |
| **Telemetry** | Observe the loop itself | `NoopTelemetry` |

## The high-level API

`createLoop()` returns a `SemanticLoop` with three methods:

| Method | What it does |
|--------|-------------|
| `loop.seed(items)` | Ingest content — auto-generates IDs, timestamps, embeddings |
| `loop.select(query?, opts?)` | Pick the best candidate — auto-embeds the query |
| `loop.ingest(itemId, platform, metrics)` | Record an outcome — auto-derives engagement score |

The raw `SemanticLoopEngine` is accessible via `loop.engine` for direct control.

<details>
<summary><strong>How the selection algorithm works</strong></summary>

Each candidate gets a weighted score:

```
weighted = similarity × 0.45
         + scoreAvg   × 0.35
         + exploration × 0.15
         + freshness   × 0.05
```

- **similarity**: cosine similarity between query vector and item embedding
- **scoreAvg**: running average from past outcomes (decay-weighted)
- **exploration**: `1 / (attempts + 1)` — untested items get a bonus
- **freshness**: exponential decay from last outcome, 168h half-life

Selection is **epsilon-greedy**: with probability 0.18, pick randomly from the top-k pool instead of the best. All weights, epsilon, and half-life are configurable.

</details>

<details>
<summary><strong>How aggregation works</strong></summary>

When an outcome arrives:

1. Critic scores the item → `criticScore`
2. Engagement derived from metrics → `engagementScore`
3. Final score = `criticScore × 0.6 + engagementScore × 0.4`
4. Aggregate updated with decay: `scoreSum = oldScoreSum × 0.95 + finalScore`
5. Running averages recomputed

Recent performance matters more than ancient history. Decay factor and weights are configurable.

</details>

<details>
<summary><strong>Engagement score derivation</strong></summary>

```
interactionRate = (likes + comments×2 + shares×3 + saves×2 + clicks×2 + conversions×4) / views
watchSignal     = clamp(avgWatchSeconds / 30)
engagementScore = interactionRate × 0.7 + watchSignal × 0.3
```

Deep engagement (shares, watch time) is weighted higher than passive signals (views, likes). When using `createLoop`, engagement is derived automatically from the metrics you pass to `ingest()`.

</details>

## Architecture

```
mod.ts (barrel)
  ├── types.ts              zero deps — all interfaces
  ├── errors.ts             zero deps — error hierarchy
  ├── utils.ts              cosine similarity, engagement, freshness
  ├── selection.ts          weighted scoring + epsilon-greedy
  ├── engine.ts             SemanticLoopEngine — the core
  ├── telemetry.ts          swappable observability
  ├── embedding.ts          EmbeddingProvider + OpenAI adapter
  ├── breeder.ts            Breeder interface + NoopBreeder
  ├── config.ts             createLoop() factory
  ├── critics/
  │   └── heuristic_critic.ts
  ├── adapters/
  │   ├── in_memory_store.ts
  │   └── supabase_rpc_store.ts
  └── runtime/
      └── edge.ts           HMAC verification, JSON helpers
```

No circular dependencies. Stateless engine, stateful database. Config as data, not singletons.

## Design principles

- **Scores are always [0, 1]** — every score clamped, no unbounded numerics
- **Readonly interfaces** — all type contracts use `readonly`, data flows without mutation
- **Web-standard APIs only** — `fetch`, `Request`, `Response`, `crypto.subtle`
- **Config is data** — serializable, composable, portable
- **Small typed core** — the engine defines interfaces, adapters implement them

## Edge usage pattern

```
edge function  →  verify webhook, ingest outcome, return fast
database       →  retrieval, aggregates, vector matching (pgvector)
background     →  re-embedding, backfills, recalibration
```

Stateless edge, stateful database. The function instance holds no memory.

## Documentation

Every doc page has **three difficulty modes** — pick the one that matches how you learn:

| Mode | What you get |
|------|-------------|
| **Vibe Coder** | Just code. Copy-paste examples. Zero theory. |
| **Beginner** | Every concept explained. What's an embedding? What's epsilon-greedy? |
| **Advanced** | Architecture internals, algorithm math, extension points |

- **[Quickstart](https://cemphlvn.github.io/semantic-loop/docs/quickstart.html)** — zero to a self-improving loop in 5 minutes
- **[API Reference](https://cemphlvn.github.io/semantic-loop/docs/api.html)** — every type, interface, class, and function
- **[Supabase Guide](https://cemphlvn.github.io/semantic-loop/docs/supabase.html)** — project setup, SQL migration, edge functions

## Agent-aligned

This library is designed to be discovered and used by AI coding assistants:

- **[llms.txt](https://cemphlvn.github.io/semantic-loop/llms.txt)** — machine-readable project index
- **[Context7](https://context7.com/cemphlvn/semantic-loop)** — indexed for real-time doc retrieval
- **Full TypeScript types** — agents generate correct code on the first try

## License

[AGPL-3.0-only](LICENSE) for the public codebase.

The `pro/` directory contains commercial extensions (LLM critic, multi-signal critic, multi-platform store, loop analytics) under a separate proprietary license.
