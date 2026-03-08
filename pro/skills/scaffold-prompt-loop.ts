/**
 * Side-Quest: Prompt Loop
 * Category: Agent Toolchains (Developer & AI Infrastructure)
 *
 * Scaffolds a self-improving prompt library where prompts
 * are scored by task outcomes and the best prompt is
 * selected per context.
 *
 * Target: AI developer who maintains prompt variants and wants
 * them to converge on what actually works per use case.
 *
 * What gets generated:
 * - Prompt variant store with task-type tribes
 * - Selection API: "best prompt for summarization"
 * - Outcome ingestion: task success, user rating, output quality
 * - Prompt performance comparison
 */

export interface PromptLoopConfig {
  readonly taskTypes: readonly string[];
  readonly evaluationMethod: "user-rating" | "llm-judge" | "automated-metric";
  readonly supabaseUrl: string;
  readonly supabaseKey: string;
}

export const DEFAULT_CONFIG: Partial<PromptLoopConfig> = {
  taskTypes: ["summarization", "extraction", "generation", "classification", "rewrite"],
  evaluationMethod: "user-rating",
};

export function generateEdgeFunction(config: PromptLoopConfig): string {
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
    noveltyKeywords: ["step by step", "think carefully", "examples", "format"],
    penaltyKeywords: ["ignore previous", "jailbreak", "pretend"],
  }),
  config: {
    selection: {
      epsilon: 0.2,
      topKExplorationPool: 3,
      freshnessHalfLifeHours: 168,
      weights: { similarity: 0.4, scoreAvg: 0.4, exploration: 0.15, freshness: 0.05 },
    },
  },
});

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // POST /register — add prompt variants
  if (url.pathname === "/register" && req.method === "POST") {
    const prompts = await req.json();
    await engine.seed(Array.isArray(prompts) ? prompts : [prompts]);
    return json({ ok: true });
  }

  // GET /prompt?tribe=summarization&queryVector=[...]
  if (url.pathname === "/prompt" && req.method === "GET") {
    const tribe = url.searchParams.get("tribe") ?? "general";
    const qv = url.searchParams.get("queryVector");
    const queryVector = qv ? JSON.parse(qv) : undefined;
    const selected = await engine.selectNext({
      tribe,
      kind: "prompt",
      queryVector,
    });
    return json({
      prompt: selected.candidate.item.content,
      id: selected.candidate.item.id,
      metadata: selected.candidate.item.metadata,
      confidence: selected.weightedScore,
      attempts: selected.candidate.aggregate.attempts,
      avgScore: selected.candidate.aggregate.scoreAvg,
    });
  }

  // POST /evaluate — record prompt outcome
  if (url.pathname === "/evaluate" && req.method === "POST") {
    const { itemId, success, rating, latencyMs, taskType } = await req.json();
    const engagementScore = success
      ? Math.min(1, 0.5 + (rating ?? 3) * 0.1)
      : Math.max(0, (rating ?? 1) * 0.1);
    const processed = await engine.ingestOutcome({
      id: crypto.randomUUID(),
      itemId,
      platform: "prompt-eval",
      occurredAt: new Date().toISOString(),
      metrics: { conversions: success ? 1 : 0 },
      engagementScore,
      payload: { taskType, latencyMs, rating },
    });
    return json({
      ok: true,
      scoreAvg: processed.aggregate.scoreAvg,
      attempts: processed.aggregate.attempts,
    });
  }

  return methodNotAllowed(["GET", "POST"]);
});`;
}
