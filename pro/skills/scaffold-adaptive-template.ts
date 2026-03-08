/**
 * Side-Quest: Adaptive Template
 * Category: Workflow Compounders (Operations & Productivity)
 *
 * Scaffolds a system where templates (proposals, outreach,
 * reports, agendas) learn from outcomes and self-improve.
 *
 * Target: Agency, sales team, or consultant who uses templates
 * repeatedly and wants them to converge on what actually works.
 *
 * What gets generated:
 * - Template store with outcome tracking
 * - Selection API: "best proposal template for enterprise deals"
 * - Outcome ingestion: win/loss, rating, completion time
 * - Template performance dashboard query
 */

export interface AdaptiveTemplateConfig {
  readonly templateKinds: readonly string[];
  readonly outcomeTypes: readonly string[];
  readonly tribes: readonly string[];
  readonly supabaseUrl: string;
  readonly supabaseKey: string;
}

export const DEFAULT_CONFIG: Partial<AdaptiveTemplateConfig> = {
  templateKinds: ["proposal", "outreach-email", "report", "meeting-agenda", "sop"],
  outcomeTypes: ["win", "loss", "rating", "completion-time"],
  tribes: ["enterprise", "mid-market", "startup"],
};

export function generateEdgeFunction(config: AdaptiveTemplateConfig): string {
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
  critic: new HeuristicCritic({
    noveltyKeywords: ["specific", "measurable", "timeline", "roi", "outcome"],
    penaltyKeywords: ["synergy", "leverage", "paradigm", "revolutionary"],
  }),
  config: {
    selection: {
      epsilon: 0.15,
      topKExplorationPool: 3,
      freshnessHalfLifeHours: 336, // 2 weeks — templates evolve slowly
      weights: { similarity: 0.3, scoreAvg: 0.5, exploration: 0.1, freshness: 0.1 },
    },
  },
});

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // GET /template?kind=proposal&tribe=enterprise
  if (url.pathname === "/template" && req.method === "GET") {
    const kind = url.searchParams.get("kind") ?? "proposal";
    const tribe = url.searchParams.get("tribe") ?? "default";
    const queryVector = url.searchParams.get("context")
      ? JSON.parse(url.searchParams.get("context")!)
      : undefined;
    const selected = await engine.selectNext({ tribe, kind, queryVector });
    return json({
      template: selected.candidate.item.content,
      id: selected.candidate.item.id,
      metadata: selected.candidate.item.metadata,
      strategy: selected.strategy,
      confidence: selected.weightedScore,
    });
  }

  // POST /outcome — record template outcome
  if (url.pathname === "/outcome" && req.method === "POST") {
    const { itemId, result, rating } = await req.json();
    const won = result === "win";
    const engagementScore = won ? Math.min(1, 0.6 + (rating ?? 0) * 0.1) : Math.max(0, (rating ?? 3) * 0.1);
    const processed = await engine.ingestOutcome({
      id: crypto.randomUUID(),
      itemId,
      platform: "workflow",
      occurredAt: new Date().toISOString(),
      metrics: { conversions: won ? 1 : 0 },
      engagementScore,
      payload: { result, rating },
    });
    return json({ ok: true, scoreAvg: processed.aggregate.scoreAvg });
  }

  return methodNotAllowed(["GET", "POST"]);
});`;
}
