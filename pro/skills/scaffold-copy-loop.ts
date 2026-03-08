/**
 * Side-Quest: Copy Loop
 * Category: Conversion Intelligence (Commerce & SaaS)
 *
 * Scaffolds a self-improving copy variant system for
 * landing pages, email subjects, CTAs, and ad copy.
 *
 * Target: SaaS founder or marketer who runs copy experiments
 * and wants compounding improvement instead of one-off A/B tests.
 *
 * What gets generated:
 * - Copy variant store with conversion tracking
 * - Webhook endpoint for conversion events (Stripe, Resend, Postmark)
 * - Selection API: "give me the best headline for this segment"
 * - Variant seeder with starter copy per funnel stage
 */

export interface CopyLoopConfig {
  readonly funnelStages: readonly string[];
  readonly copyKinds: readonly string[];
  readonly conversionWebhook: "stripe" | "resend" | "postmark" | "custom";
  readonly supabaseUrl: string;
  readonly supabaseKey: string;
}

export const DEFAULT_CONFIG: Partial<CopyLoopConfig> = {
  funnelStages: ["awareness", "consideration", "decision"],
  copyKinds: ["headline", "subheadline", "cta", "email-subject", "ad-copy"],
  conversionWebhook: "stripe",
};

export function generateEdgeFunction(config: CopyLoopConfig): string {
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
    noveltyKeywords: ["you", "free", "now", "because", "new"],
    penaltyKeywords: ["limited time", "act now", "guaranteed", "no risk"],
  }),
  config: {
    selection: {
      epsilon: 0.25,
      topKExplorationPool: 5,
      freshnessHalfLifeHours: 72,
      weights: { similarity: 0.3, scoreAvg: 0.5, exploration: 0.15, freshness: 0.05 },
    },
  },
});

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // GET /select?kind=headline&tribe=saas-founders
  if (url.pathname === "/select" && req.method === "GET") {
    const kind = url.searchParams.get("kind") ?? "headline";
    const tribe = url.searchParams.get("tribe") ?? "default";
    const selected = await engine.selectNext({ tribe, kind });
    return json({
      copy: selected.candidate.item.content,
      id: selected.candidate.item.id,
      strategy: selected.strategy,
    });
  }

  // POST /convert — record a conversion event
  if (url.pathname === "/convert" && req.method === "POST") {
    const { itemId, platform, metrics } = await req.json();
    const engagementScore = deriveEngagementScore(metrics);
    const processed = await engine.ingestOutcome({
      id: crypto.randomUUID(),
      itemId,
      platform: platform ?? "web",
      occurredAt: new Date().toISOString(),
      metrics,
      engagementScore,
    });
    return json({ ok: true, scoreAvg: processed.aggregate.scoreAvg });
  }

  return methodNotAllowed(["GET", "POST"]);
});`;
}
