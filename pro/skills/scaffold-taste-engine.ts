/**
 * Side-Quest: Taste Engine
 * Category: Taste Networks (Discovery & Personalization)
 *
 * Scaffolds a personal recommendation engine that learns
 * taste from accept/reject/rating signals.
 *
 * Target: Anyone building a discovery product — music, books,
 * restaurants, products, people to follow, tools to try.
 *
 * What gets generated:
 * - Recommendation pool with embeddings
 * - "Next suggestion" endpoint that improves with every rating
 * - Rating ingestion endpoint
 * - Taste profile summary
 */

export interface TasteEngineConfig {
  readonly domain: string;
  readonly itemKinds: readonly string[];
  readonly ratingScale: "binary" | "5-star" | "10-point";
  readonly supabaseUrl: string;
  readonly supabaseKey: string;
}

export const DEFAULT_CONFIG: Partial<TasteEngineConfig> = {
  domain: "books",
  itemKinds: ["recommendation"],
  ratingScale: "5-star",
};

export function generateEdgeFunction(config: TasteEngineConfig): string {
  const ratingNormalizer = config.ratingScale === "binary"
    ? "rating ? 0.8 : 0.2"
    : config.ratingScale === "5-star"
    ? "Math.max(0, Math.min(1, rating / 5))"
    : "Math.max(0, Math.min(1, rating / 10))";

  return `import {
  SemanticLoopEngine,
  SupabaseRpcStore,
  HeuristicCritic,
  json,
  methodNotAllowed,
} from "jsr:@semantic-loop/core";

const store = new SupabaseRpcStore({
  url: Deno.env.get("SUPABASE_URL") ?? "",
  serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
});

const engine = new SemanticLoopEngine({
  store,
  critic: new HeuristicCritic(),
  config: {
    selection: {
      epsilon: 0.3,          // High exploration — taste discovery needs variety
      topKExplorationPool: 5,
      freshnessHalfLifeHours: 24,
      weights: { similarity: 0.5, scoreAvg: 0.3, exploration: 0.15, freshness: 0.05 },
    },
  },
});

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // POST /add — add items to the recommendation pool
  if (url.pathname === "/add" && req.method === "POST") {
    const items = await req.json();
    await engine.seed(Array.isArray(items) ? items : [items]);
    return json({ ok: true });
  }

  // GET /suggest?tribe=user_123&queryVector=[...]
  if (url.pathname === "/suggest" && req.method === "GET") {
    const tribe = url.searchParams.get("tribe") ?? "default";
    const qv = url.searchParams.get("queryVector");
    const queryVector = qv ? JSON.parse(qv) : undefined;
    const selected = await engine.selectNext({
      tribe,
      kind: "recommendation",
      queryVector,
    });
    return json({
      suggestion: selected.candidate.item.content,
      id: selected.candidate.item.id,
      metadata: selected.candidate.item.metadata,
      confidence: selected.weightedScore,
      strategy: selected.strategy,
    });
  }

  // POST /rate — rate a suggestion
  if (url.pathname === "/rate" && req.method === "POST") {
    const { itemId, rating } = await req.json();
    const engagementScore = ${ratingNormalizer};
    const processed = await engine.ingestOutcome({
      id: crypto.randomUUID(),
      itemId,
      platform: "${config.domain}",
      occurredAt: new Date().toISOString(),
      metrics: { likes: rating },
      engagementScore,
    });
    return json({ ok: true, scoreAvg: processed.aggregate.scoreAvg });
  }

  return methodNotAllowed(["GET", "POST"]);
});`;
}
