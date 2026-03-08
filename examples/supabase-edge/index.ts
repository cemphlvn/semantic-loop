import {
  deriveEngagementScore,
  HeuristicCritic,
  json,
  methodNotAllowed,
  SemanticLoopEngine,
  SupabaseRpcStore,
  verifyHmacSignature,
  type EngagementMetrics,
  type JsonObject,
} from "../../mod.ts";

interface AyrshareWebhookBody {
  readonly eventId: string;
  readonly hookId: string;
  readonly platform: string;
  readonly occurredAt: string;
  readonly metrics: EngagementMetrics;
  readonly payload?: JsonObject;
}

const store = new SupabaseRpcStore({
  url: Deno.env.get("SUPABASE_URL") ?? "",
  serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
});

const critic = new HeuristicCritic();
const engine = new SemanticLoopEngine({ store, critic });

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const body = await request.text();
  const signature = request.headers.get("x-signature") ?? "";
  const secret = Deno.env.get("AYRSHARE_WEBHOOK_SECRET") ?? "";

  if (secret) {
    const ok = await verifyHmacSignature({
      body,
      signature,
      secret,
    });

    if (!ok) {
      return json({ error: "Invalid signature" }, 401);
    }
  }

  const payload = JSON.parse(body) as AyrshareWebhookBody;
  const engagementScore = deriveEngagementScore(payload.metrics);

  const processed = await engine.ingestOutcome({
    id: payload.eventId,
    itemId: payload.hookId,
    platform: payload.platform,
    occurredAt: payload.occurredAt,
    metrics: payload.metrics,
    engagementScore,
    payload: payload.payload,
  });

  return json({
    ok: true,
    itemId: processed.item.id,
    finalScore: processed.finalScore,
    scoreAvg: processed.aggregate.scoreAvg,
    attempts: processed.aggregate.attempts,
  });
});
