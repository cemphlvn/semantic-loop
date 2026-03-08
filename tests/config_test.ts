import { assertEquals, assertExists } from "jsr:@std/assert";
import { createLoop } from "../mod.ts";

Deno.test("createLoop with memory store: full seed, select, ingest cycle", async () => {
  const loop = createLoop({ store: "memory" });

  const seeded = await loop.seed([
    { content: "The moat is the loop that compounds.", tribe: "founders", kind: "hook" },
    { content: "Generic productivity advice.", tribe: "founders", kind: "hook" },
  ]);

  assertEquals(seeded.length, 2);
  assertExists(seeded[0].id);
  assertEquals(seeded[0].tribe, "founders");

  const pick = await loop.select(undefined, { tribe: "founders" });
  assertExists(pick.candidate);

  const result = await loop.ingest(pick.candidate.item.id, "instagram", {
    views: 1000,
    likes: 80,
    comments: 10,
    shares: 5,
  });

  assertExists(result.finalScore);
  assertEquals(result.aggregate.attempts, 1);
});

Deno.test("createLoop defaults tribe and kind when omitted", async () => {
  const loop = createLoop({ store: { provider: "memory" } });

  const [item] = await loop.seed([{ content: "test content" }]);
  assertEquals(item.tribe, "default");
  assertEquals(item.kind, "item");
});

Deno.test("createLoop auto-derives engagement score from metrics", async () => {
  const loop = createLoop({ store: "memory" });

  await loop.seed([{ content: "test item" }]);
  const pick = await loop.select();

  const result = await loop.ingest(pick.candidate.item.id, "x", {
    views: 500,
    likes: 25,
    comments: 5,
    shares: 3,
  });

  assertEquals(result.outcome.engagementScore > 0, true);
});

Deno.test("createLoop accepts custom heuristic critic config", async () => {
  const loop = createLoop({
    store: "memory",
    critic: {
      provider: "heuristic",
      noveltyKeywords: ["compounding"],
      penaltyKeywords: ["viral"],
    },
  });

  const seeded = await loop.seed([
    { content: "Compounding loops build moats." },
    { content: "Go viral with this one trick." },
  ]);

  const r1 = await loop.ingest(seeded[0].id, "x", { views: 100, likes: 10 });
  const r2 = await loop.ingest(seeded[1].id, "x", { views: 100, likes: 10 });

  // "compounding" is a novelty keyword, "viral" is a penalty keyword
  assertEquals(r1.critic.tags.includes("novelty"), true);
  assertEquals(r2.critic.tags.includes("hype-risk"), true);
});

Deno.test("createLoop accepts a raw MemoryStore escape hatch", async () => {
  const { InMemoryStore } = await import("../mod.ts");
  const raw = new InMemoryStore();

  const loop = createLoop({ store: raw });
  assertEquals(loop.store, raw);

  await loop.seed([{ content: "escape hatch test" }]);
  const pick = await loop.select();
  assertExists(pick.candidate);
});

Deno.test("createLoop selection tuning affects behavior", async () => {
  const loop = createLoop({
    store: "memory",
    selection: { epsilon: 0, topKExplorationPool: 1 },
  });

  await loop.seed([
    { content: "item a" },
    { content: "item b" },
  ]);

  // With epsilon 0, selection is always greedy
  const pick = await loop.select();
  assertEquals(pick.strategy, "greedy");
});
