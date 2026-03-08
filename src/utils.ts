import type {
  AggregateState,
  EmbeddingVector,
  EngagementMetrics,
  SelectionConfig,
} from "./types.ts";

/** Clamp a numeric value to the given range (default `[0, 1]`). */
export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

/** Compute cosine similarity between two embedding vectors, normalized to `[0, 1]`. */
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;

  for (let index = 0; index < a.length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    dot += av * bv;
    aNorm += av * av;
    bNorm += bv * bv;
  }

  if (aNorm === 0 || bNorm === 0) {
    return 0;
  }

  return clamp((dot / Math.sqrt(aNorm * bNorm) + 1) / 2, 0, 1);
}

/** Create a zero-valued {@link AggregateState} for a new item. */
export function defaultAggregate(itemId: string, nowIso: string): AggregateState {
  return {
    itemId,
    attempts: 0,
    scoreSum: 0,
    scoreAvg: 0,
    criticAvg: 0,
    engagementAvg: 0,
    updatedAt: nowIso,
  };
}

/** Derive a `[0, 1]` engagement score from raw metrics (interaction rate + watch signal). */
export function deriveEngagementScore(metrics: EngagementMetrics): number {
  const views = metrics.views ?? metrics.impressions ?? 0;
  const likes = metrics.likes ?? 0;
  const comments = metrics.comments ?? 0;
  const shares = metrics.shares ?? 0;
  const saves = metrics.saves ?? 0;
  const clicks = metrics.clicks ?? 0;
  const conversions = metrics.conversions ?? 0;
  const avgWatchSeconds = metrics.avgWatchSeconds ?? 0;

  const interactionRate = views > 0
    ? (likes + comments * 2 + shares * 3 + saves * 2 + clicks * 2 + conversions * 4) / views
    : 0;
  const watchSignal = clamp(avgWatchSeconds / 30, 0, 1);

  return clamp(interactionRate * 0.7 + watchSignal * 0.3, 0, 1);
}

/** Return the number of hours elapsed between an ISO date string and `now`. Returns `Infinity` if the date is unparseable. */
export function hoursSince(isoDate: string, now: Date): number {
  const then = Date.parse(isoDate);
  if (Number.isNaN(then)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, now.getTime() - then) / 3_600_000;
}

/** Exponential-decay freshness score (`[0, 1]`) based on time since last outcome. */
export function freshnessScore(
  aggregate: AggregateState,
  config: SelectionConfig,
  now: Date,
): number {
  const pivot = aggregate.lastOutcomeAt ?? aggregate.updatedAt;
  const elapsedHours = hoursSince(pivot, now);
  if (!Number.isFinite(elapsedHours)) {
    return 1;
  }

  const halfLife = Math.max(1, config.freshnessHalfLifeHours);
  const score = Math.exp((-Math.LN2 * elapsedHours) / halfLife);
  return clamp(score, 0, 1);
}

/** Exploration bonus (`[0, 1]`): `1 / (attempts + 1)`, favoring less-tested items. */
export function explorationScore(attempts: number): number {
  return clamp(1 / Math.max(1, attempts + 1), 0, 1);
}
