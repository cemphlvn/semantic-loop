import { assertEquals, assertExists } from "jsr:@std/assert";
import {
  type BreedContext,
  type Breeder,
  createLoop,
  deriveEngagementScore,
  HeuristicCritic,
  InMemoryStore,
  type ItemInput,
  type JsonObject,
  NoopBreeder,
  type SemanticItem,
  SemanticLoopEngine,
} from "../mod.ts";

const NOW = new Date("2026-03-09T00:00:00.000Z");

function makeItem(id: string, metadata: JsonObject = {}): SemanticItem {
  return {
    id,
    tribe: "founders",
    kind: "hook",
    content: `Content for ${id}`,
    embedding: [1, 0, 0, 0],
    metadata,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function highEngagement() {
  return {
    views: 10000,
    likes: 800,
    comments: 200,
    shares: 150,
    saves: 300,
    clicks: 500,
    conversions: 50,
    avgWatchSeconds: 25,
  };
}

function lowEngagement() {
  return { views: 10000, likes: 2 };
}

function mockBreeder(items: readonly ItemInput[]): Breeder {
  return {
    async breed(_context: BreedContext): Promise<readonly ItemInput[]> {
      return items;
    },
  };
}

Deno.test("NoopBreeder returns empty array", async (): Promise<void> => {
  const breeder = new NoopBreeder();
  const result = await breeder.breed({} as BreedContext);
  assertEquals(result, []);
});

Deno.test("breeding triggers when finalScore crosses threshold", async (): Promise<void> => {
  const store = new InMemoryStore((): Date => NOW);
  const breeder = mockBreeder([{ content: "child variation" }]);
  const engine = new SemanticLoopEngine({
    store,
    critic: new HeuristicCritic(),
    breeder,
    random: (): number => 0.99,
    now: (): Date => NOW,
    config: { breeding: { scoreThreshold: 0.3, minAttempts: 0 } },
  });

  await engine.seed([makeItem("a")]);

  const metrics = highEngagement();
  const result = await engine.ingestOutcome({
    id: "evt_1",
    itemId: "a",
    platform: "instagram",
    occurredAt: NOW.toISOString(),
    metrics,
    engagementScore: deriveEngagementScore(metrics),
  });

  assertExists(result.bredInputs);
  assertEquals(result.bredInputs.length, 1);
  assertEquals(result.bredInputs[0].content, "child variation");
  assertEquals(result.bredInputs[0].metadata?.parentId, "a");
  assertEquals(result.bredInputs[0].metadata?.generation, 1);
});

Deno.test("breeding skipped when score below threshold", async (): Promise<void> => {
  const store = new InMemoryStore((): Date => NOW);
  const breeder = mockBreeder([{ content: "should not appear" }]);
  const engine = new SemanticLoopEngine({
    store,
    critic: new HeuristicCritic(),
    breeder,
    random: (): number => 0.99,
    now: (): Date => NOW,
    config: { breeding: { scoreThreshold: 0.99 } },
  });

  await engine.seed([makeItem("a")]);

  const metrics = lowEngagement();
  const result = await engine.ingestOutcome({
    id: "evt_1",
    itemId: "a",
    platform: "instagram",
    occurredAt: NOW.toISOString(),
    metrics,
    engagementScore: deriveEngagementScore(metrics),
  });

  assertEquals(result.bredInputs, undefined);
});

Deno.test("generation limit blocks deep breeding", async (): Promise<void> => {
  const store = new InMemoryStore((): Date => NOW);
  const breeder = mockBreeder([{ content: "should not appear" }]);
  const engine = new SemanticLoopEngine({
    store,
    critic: new HeuristicCritic(),
    breeder,
    random: (): number => 0.99,
    now: (): Date => NOW,
    config: { breeding: { scoreThreshold: 0.3, minAttempts: 0, maxGeneration: 2 } },
  });

  // Item is already at generation 2
  await engine.seed([makeItem("a", { generation: 2 })]);

  const metrics = highEngagement();
  const result = await engine.ingestOutcome({
    id: "evt_1",
    itemId: "a",
    platform: "instagram",
    occurredAt: NOW.toISOString(),
    metrics,
    engagementScore: deriveEngagementScore(metrics),
  });

  assertEquals(result.bredInputs, undefined);
});

Deno.test("maxChildrenPerBreed truncates output", async (): Promise<void> => {
  const store = new InMemoryStore((): Date => NOW);
  const manyChildren: ItemInput[] = Array.from({ length: 10 }, (_, i) => ({
    content: `child-${i}`,
  }));
  const breeder = mockBreeder(manyChildren);
  const engine = new SemanticLoopEngine({
    store,
    critic: new HeuristicCritic(),
    breeder,
    random: (): number => 0.99,
    now: (): Date => NOW,
    config: {
      breeding: { scoreThreshold: 0.3, minAttempts: 0, maxChildrenPerBreed: 2 },
    },
  });

  await engine.seed([makeItem("a")]);

  const metrics = highEngagement();
  const result = await engine.ingestOutcome({
    id: "evt_1",
    itemId: "a",
    platform: "instagram",
    occurredAt: NOW.toISOString(),
    metrics,
    engagementScore: deriveEngagementScore(metrics),
  });

  assertExists(result.bredInputs);
  assertEquals(result.bredInputs.length, 2);
});

Deno.test("cooldown prevents re-breeding same parent", async (): Promise<void> => {
  const oneHourAgo = new Date(NOW.getTime() - 3_600_000).toISOString();
  const store = new InMemoryStore((): Date => NOW);
  const breeder = mockBreeder([{ content: "should not appear" }]);
  const engine = new SemanticLoopEngine({
    store,
    critic: new HeuristicCritic(),
    breeder,
    random: (): number => 0.99,
    now: (): Date => NOW,
    config: {
      breeding: { scoreThreshold: 0.3, minAttempts: 0, cooldownHours: 24 },
    },
  });

  // Parent was bred 1 hour ago — still within 24h cooldown
  await engine.seed([makeItem("a", { lastBredAt: oneHourAgo })]);

  const metrics = highEngagement();
  const result = await engine.ingestOutcome({
    id: "evt_1",
    itemId: "a",
    platform: "instagram",
    occurredAt: NOW.toISOString(),
    metrics,
    engagementScore: deriveEngagementScore(metrics),
  });

  assertEquals(result.bredInputs, undefined);
});

Deno.test("lineage metadata inherits parent tribe and kind", async (): Promise<void> => {
  const store = new InMemoryStore((): Date => NOW);
  const breeder = mockBreeder([
    { content: "inherits parent tribe/kind" },
    { content: "overrides tribe", tribe: "creators", kind: "caption" },
  ]);
  const engine = new SemanticLoopEngine({
    store,
    critic: new HeuristicCritic(),
    breeder,
    random: (): number => 0.99,
    now: (): Date => NOW,
    config: { breeding: { scoreThreshold: 0.3, minAttempts: 0 } },
  });

  await engine.seed([makeItem("a")]);

  const metrics = highEngagement();
  const result = await engine.ingestOutcome({
    id: "evt_1",
    itemId: "a",
    platform: "instagram",
    occurredAt: NOW.toISOString(),
    metrics,
    engagementScore: deriveEngagementScore(metrics),
  });

  assertExists(result.bredInputs);
  // First child inherits parent's tribe/kind
  assertEquals(result.bredInputs[0].tribe, "founders");
  assertEquals(result.bredInputs[0].kind, "hook");
  // Second child overrides
  assertEquals(result.bredInputs[1].tribe, "creators");
  assertEquals(result.bredInputs[1].kind, "caption");
});

Deno.test("createLoop embeds and seeds bred items", async (): Promise<void> => {
  const breeder = mockBreeder([{ content: "bred variation" }]);
  const loop = createLoop({
    store: "memory",
    breeder,
    breeding: { scoreThreshold: 0.3, minAttempts: 0 },
  });

  await loop.seed([
    { content: "parent item", tribe: "founders", kind: "hook" },
  ]);

  const pick = await loop.select();
  const metrics = highEngagement();
  const result = await loop.ingest(pick.candidate.item.id, "instagram", metrics);

  assertExists(result.bredInputs);
  assertEquals(result.bredInputs.length, 1);

  // Bred item should now be in the store and selectable
  const candidates = await loop.store.retrieve({ tribe: "founders" });
  // Original + bred = 2 items
  assertEquals(candidates.length, 2);
});
