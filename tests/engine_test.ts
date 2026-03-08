import { assertEquals, assertExists } from "jsr:@std/assert";
import {
  deriveEngagementScore,
  HeuristicCritic,
  InMemoryStore,
  SemanticLoopEngine,
  type SemanticItem,
} from "../mod.ts";

Deno.test("semantic loop selects and updates aggregate state", async (): Promise<void> => {
  const now = new Date("2026-03-08T00:00:00.000Z");
  const store = new InMemoryStore((): Date => now);
  const critic = new HeuristicCritic();
  const engine = new SemanticLoopEngine({
    store,
    critic,
    random: (): number => 0.99,
    now: (): Date => now,
  });

  const items: SemanticItem[] = [
    {
      id: "a",
      tribe: "founders",
      kind: "hook",
      content: "The moat is the loop that compounds after every post.",
      embedding: [1, 0, 0, 0],
      metadata: {},
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: "b",
      tribe: "founders",
      kind: "hook",
      content: "Generic productivity advice.",
      embedding: [0, 1, 0, 0],
      metadata: {},
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ];

  await engine.seed(items);

  const selected = await engine.selectNext({
    tribe: "founders",
    kind: "hook",
    queryVector: [1, 0, 0, 0],
  });

  assertEquals(selected.candidate.item.id, "a");

  const engagementScore = deriveEngagementScore({
    views: 1000,
    likes: 80,
    comments: 10,
    shares: 5,
    avgWatchSeconds: 16,
  });

  const processed = await engine.ingestOutcome({
    id: "evt_1",
    itemId: "a",
    platform: "instagram",
    occurredAt: now.toISOString(),
    metrics: {
      views: 1000,
      likes: 80,
      comments: 10,
      shares: 5,
      avgWatchSeconds: 16,
    },
    engagementScore,
  });

  assertExists(processed.aggregate.lastScore);
  assertEquals(processed.aggregate.attempts, 1);
});
