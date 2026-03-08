/**
 * Loop Analytics
 *
 * Computes aggregate health metrics for a semantic loop:
 * convergence rate, exploration efficiency, score drift,
 * and staleness detection.
 *
 * Designed to answer: "Is my loop actually getting smarter?"
 */
import type { AggregateState, Candidate, MemoryStore, RetrieveRequest } from "../../src/types.ts";

export interface LoopHealthReport {
  readonly totalItems: number;
  readonly activeItems: number;
  readonly staleItems: number;
  readonly avgScore: number;
  readonly scoreStdDev: number;
  readonly avgAttempts: number;
  readonly explorationRatio: number;
  readonly topPerformers: readonly string[];
  readonly needsAttention: readonly string[];
  readonly convergenceSignal: "improving" | "plateaued" | "declining" | "insufficient-data";
}

export interface AnalyticsOptions {
  readonly store: MemoryStore;
  readonly staleThresholdHours?: number;
  readonly topN?: number;
}

export class LoopAnalytics {
  readonly #store: MemoryStore;
  readonly #staleThresholdHours: number;
  readonly #topN: number;

  public constructor(options: AnalyticsOptions) {
    this.#store = options.store;
    this.#staleThresholdHours = options.staleThresholdHours ?? 168;
    this.#topN = options.topN ?? 5;
  }

  public async healthReport(request: RetrieveRequest): Promise<LoopHealthReport> {
    const candidates = await this.#store.retrieve({ ...request, limit: 1000 });
    if (candidates.length === 0) {
      return emptyReport();
    }

    const now = new Date();
    const aggregates = candidates.map((c) => c.aggregate);
    const scores = aggregates.map((a) => a.scoreAvg);
    const attempts = aggregates.map((a) => a.attempts);

    const avgScore = mean(scores);
    const scoreStdDev = stdDev(scores, avgScore);
    const avgAttempts = mean(attempts);

    const staleThresholdMs = this.#staleThresholdHours * 3_600_000;
    const staleItems = aggregates.filter((a) => {
      const pivot = a.lastOutcomeAt ?? a.updatedAt;
      return (now.getTime() - Date.parse(pivot)) > staleThresholdMs;
    });

    const unexplored = aggregates.filter((a) => a.attempts <= 1);
    const explorationRatio = candidates.length > 0
      ? unexplored.length / candidates.length
      : 0;

    const sorted = [...candidates].sort((a, b) => b.aggregate.scoreAvg - a.aggregate.scoreAvg);
    const topPerformers = sorted.slice(0, this.#topN).map((c) => c.item.id);
    const needsAttention = sorted
      .filter((c) => c.aggregate.attempts >= 3 && c.aggregate.scoreAvg < 0.3)
      .slice(0, this.#topN)
      .map((c) => c.item.id);

    const convergenceSignal = deriveConvergence(aggregates);

    return {
      totalItems: candidates.length,
      activeItems: candidates.length - staleItems.length,
      staleItems: staleItems.length,
      avgScore,
      scoreStdDev,
      avgAttempts,
      explorationRatio,
      topPerformers,
      needsAttention,
      convergenceSignal,
    };
  }
}

function emptyReport(): LoopHealthReport {
  return {
    totalItems: 0,
    activeItems: 0,
    staleItems: 0,
    avgScore: 0,
    scoreStdDev: 0,
    avgAttempts: 0,
    explorationRatio: 0,
    topPerformers: [],
    needsAttention: [],
    convergenceSignal: "insufficient-data",
  };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: readonly number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function deriveConvergence(
  aggregates: readonly AggregateState[],
): LoopHealthReport["convergenceSignal"] {
  const withHistory = aggregates.filter((a) => a.attempts >= 3);
  if (withHistory.length < 3) return "insufficient-data";

  const recentlyImproved = withHistory.filter((a) =>
    a.lastScore !== undefined && a.lastScore > a.scoreAvg
  );
  const ratio = recentlyImproved.length / withHistory.length;

  if (ratio > 0.6) return "improving";
  if (ratio > 0.35) return "plateaued";
  return "declining";
}
