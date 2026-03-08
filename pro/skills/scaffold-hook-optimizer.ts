/**
 * Side-Quest: Hook Optimizer
 * Category: Attention Arbitrage (Creator & Media)
 *
 * Scaffolds a complete self-improving hook selection system.
 * Seed hooks → publish → ingest platform signals → loop gets smarter.
 *
 * Target: Creator who posts daily and wants to stop guessing which hooks land.
 *
 * What gets generated:
 * - Supabase edge function for webhook ingestion
 * - Seed script with starter hooks per tribe
 * - Selection endpoint for "give me the next best hook"
 * - Dashboard query for top performers
 */

export interface HookOptimizerConfig {
  readonly tribes: readonly string[];
  readonly platforms: readonly string[];
  readonly hooksPerTribe: number;
  readonly supabaseUrl: string;
  readonly supabaseKey: string;
}

export const DEFAULT_CONFIG: Partial<HookOptimizerConfig> = {
  tribes: ["ai-founders", "indie-hackers", "creators"],
  platforms: ["instagram", "tiktok", "x"],
  hooksPerTribe: 20,
};

export function generateEdgeFunction(config: HookOptimizerConfig): string {
  return `import {
  deriveEngagementScore,
  HeuristicCritic,
  SemanticLoopEngine,
  SupabaseRpcStore,
  verifyHmacSignature,
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
});

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/select" && req.method === "POST") {
    const { tribe, kind, queryVector } = await req.json();
    const selected = await engine.selectNext({ tribe, kind: kind ?? "hook", queryVector });
    return json({
      hook: selected.candidate.item.content,
      id: selected.candidate.item.id,
      strategy: selected.strategy,
      score: selected.weightedScore,
    });
  }

  if (url.pathname === "/webhook" && req.method === "POST") {
    const body = await req.text();
    const sig = req.headers.get("x-signature") ?? "";
    const secret = Deno.env.get("WEBHOOK_SECRET") ?? "";

    if (secret) {
      const ok = await verifyHmacSignature({ body, signature: sig, secret });
      if (!ok) return json({ error: "Invalid signature" }, 401);
    }

    const payload = JSON.parse(body);
    const engagementScore = deriveEngagementScore(payload.metrics);
    const processed = await engine.ingestOutcome({
      id: payload.eventId,
      itemId: payload.hookId,
      platform: payload.platform,
      occurredAt: payload.occurredAt,
      metrics: payload.metrics,
      engagementScore,
    });

    return json({
      ok: true,
      scoreAvg: processed.aggregate.scoreAvg,
      attempts: processed.aggregate.attempts,
    });
  }

  return methodNotAllowed(["POST"]);
});`;
}

export function generateSeedScript(config: HookOptimizerConfig): string {
  return `import { SemanticLoopEngine, SupabaseRpcStore, HeuristicCritic } from "jsr:@semantic-loop/core";

const store = new SupabaseRpcStore({
  url: "${config.supabaseUrl}",
  serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
});

const engine = new SemanticLoopEngine({ store, critic: new HeuristicCritic() });

// Replace embeddings with real vectors from your embedding provider
const hooks = [
  // TODO: Add ${config.hooksPerTribe} hooks per tribe
  // Each hook needs: id, tribe, kind: "hook", content, embedding, metadata
];

await engine.seed(hooks);
console.log(\`Seeded \${hooks.length} hooks.\`);`;
}
