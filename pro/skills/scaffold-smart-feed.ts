/**
 * Side-Quest: Smart Feed
 * Category: Curation Economies (Knowledge & Community)
 *
 * Scaffolds a self-curating feed that learns which content
 * its audience actually engages with. Works for newsletters,
 * community digests, reading lists, and resource hubs.
 *
 * Target: Newsletter operator, community manager, or knowledge worker
 * who curates links and wants the curation to compound.
 *
 * What gets generated:
 * - Content ingestion endpoint (add links/articles to the pool)
 * - Feed selection API (ranked by learned quality)
 * - Engagement webhook (click, read-time, save, reply)
 * - Weekly digest generator (top N items by score)
 */

export interface SmartFeedConfig {
  readonly feedKinds: readonly string[];
  readonly digestSize: number;
  readonly engagementSignals: readonly string[];
  readonly supabaseUrl: string;
  readonly supabaseKey: string;
}

export const DEFAULT_CONFIG: Partial<SmartFeedConfig> = {
  feedKinds: ["article", "tool", "thread", "video", "paper"],
  digestSize: 10,
  engagementSignals: ["click", "read", "save", "reply", "share"],
};

export function generateEdgeFunction(config: SmartFeedConfig): string {
  return `import {
  SemanticLoopEngine,
  SupabaseRpcStore,
  HeuristicCritic,
  deriveEngagementScore,
  json,
  methodNotAllowed,
} from "jsr:@semantic-loop/core";

const store = new SupabaseRpcStore({
  url: Deno.env.get("SUPABASE_URL") ?? "",
  serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
});

const engine = new SemanticLoopEngine({
  store,
  critic: new HeuristicCritic({
    noveltyKeywords: ["research", "framework", "deep-dive", "analysis", "how"],
    penaltyKeywords: ["listicle", "top 10", "you won't believe"],
  }),
  config: {
    selection: {
      epsilon: 0.2,
      topKExplorationPool: 4,
      freshnessHalfLifeHours: 48,
      weights: { similarity: 0.35, scoreAvg: 0.4, exploration: 0.15, freshness: 0.1 },
    },
  },
});

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // POST /ingest — add a new item to the feed pool
  if (url.pathname === "/ingest" && req.method === "POST") {
    const item = await req.json();
    await engine.seed([{
      ...item,
      createdAt: item.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }]);
    return json({ ok: true, id: item.id });
  }

  // GET /feed?tribe=ai&limit=10 — get ranked feed
  if (url.pathname === "/feed" && req.method === "GET") {
    const tribe = url.searchParams.get("tribe") ?? "default";
    const limit = Number(url.searchParams.get("limit") ?? "${config.digestSize}");
    const items = [];
    for (let i = 0; i < limit; i++) {
      try {
        const selected = await engine.selectNext({ tribe, limit: limit - i });
        items.push({
          id: selected.candidate.item.id,
          content: selected.candidate.item.content,
          kind: selected.candidate.item.kind,
          score: selected.weightedScore,
          strategy: selected.strategy,
        });
      } catch { break; }
    }
    return json({ items });
  }

  // POST /engage — record engagement signal
  if (url.pathname === "/engage" && req.method === "POST") {
    const { itemId, signal, value } = await req.json();
    const metrics = { [signal]: value ?? 1 };
    const engagementScore = deriveEngagementScore(metrics);
    const processed = await engine.ingestOutcome({
      id: crypto.randomUUID(),
      itemId,
      platform: "feed",
      occurredAt: new Date().toISOString(),
      metrics,
      engagementScore,
    });
    return json({ ok: true, scoreAvg: processed.aggregate.scoreAvg });
  }

  return methodNotAllowed(["GET", "POST"]);
});`;
}
