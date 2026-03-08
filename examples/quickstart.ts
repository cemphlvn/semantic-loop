/**
 * semantic-loop quickstart
 *
 * Run: deno run examples/quickstart.ts
 *
 * No external services needed — uses in-memory store.
 * Shows the full loop: seed → select → observe → ingest → select again.
 */
import { createLoop } from "../mod.ts";

const loop = createLoop({ store: "memory" });

// 1. Seed content
await loop.seed([
  {
    content: "The moat is the loop that compounds after every post.",
    tribe: "founders",
    kind: "hook",
  },
  {
    content: "Generic productivity advice.",
    tribe: "founders",
    kind: "hook",
  },
  {
    content: "Why most founders build features when they should build feedback loops.",
    tribe: "founders",
    kind: "hook",
  },
]);

console.log("Seeded 3 items.\n");

// 2. Select best match (no embeddings — relies on exploration + freshness)
const pick = await loop.select(undefined, { tribe: "founders" });
console.log(`Selected: "${pick.candidate.item.content}"`);
console.log(`Strategy: ${pick.strategy}, Score: ${pick.weightedScore.toFixed(3)}\n`);

// 3. Simulate real-world outcome
const result = await loop.ingest(pick.candidate.item.id, "instagram", {
  views: 12400,
  likes: 340,
  comments: 45,
  shares: 89,
  saves: 214,
  avgWatchSeconds: 18,
});

console.log("Outcome ingested:");
console.log(`  Final score: ${result.finalScore.toFixed(3)}`);
console.log(`  Critic: ${result.critic.rationale}`);
console.log(`  Tags: ${result.critic.tags.join(", ")}\n`);

// 4. Select again — now informed by the outcome
const pick2 = await loop.select(undefined, { tribe: "founders" });
console.log(`Next selection: "${pick2.candidate.item.content}"`);
console.log(`Strategy: ${pick2.strategy}, Score: ${pick2.weightedScore.toFixed(3)}`);
