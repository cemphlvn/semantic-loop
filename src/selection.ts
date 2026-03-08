import type {
  Candidate,
  SelectedCandidate,
  SelectionConfig,
} from "./types.ts";
import { clamp, explorationScore, freshnessScore } from "./utils.ts";

export const DEFAULT_SELECTION_CONFIG: SelectionConfig = {
  epsilon: 0.18,
  topKExplorationPool: 3,
  freshnessHalfLifeHours: 168,
  weights: {
    similarity: 0.45,
    scoreAvg: 0.35,
    exploration: 0.15,
    freshness: 0.05,
  },
};

export function mergeSelectionConfig(config?: Partial<SelectionConfig>): SelectionConfig {
  return {
    epsilon: config?.epsilon ?? DEFAULT_SELECTION_CONFIG.epsilon,
    topKExplorationPool: config?.topKExplorationPool ?? DEFAULT_SELECTION_CONFIG.topKExplorationPool,
    freshnessHalfLifeHours: config?.freshnessHalfLifeHours ?? DEFAULT_SELECTION_CONFIG.freshnessHalfLifeHours,
    weights: {
      similarity: config?.weights?.similarity ?? DEFAULT_SELECTION_CONFIG.weights.similarity,
      scoreAvg: config?.weights?.scoreAvg ?? DEFAULT_SELECTION_CONFIG.weights.scoreAvg,
      exploration: config?.weights?.exploration ?? DEFAULT_SELECTION_CONFIG.weights.exploration,
      freshness: config?.weights?.freshness ?? DEFAULT_SELECTION_CONFIG.weights.freshness,
    },
  };
}

export function computeWeightedScore(
  candidate: Candidate,
  config: SelectionConfig,
  now: Date,
): number {
  const weights = config.weights;
  const exploration = explorationScore(candidate.aggregate.attempts);
  const freshness = freshnessScore(candidate.aggregate, config, now);

  return clamp(
    candidate.similarity * weights.similarity +
      candidate.aggregate.scoreAvg * weights.scoreAvg +
      exploration * weights.exploration +
      freshness * weights.freshness,
    0,
    1,
  );
}

export function selectCandidate(
  candidates: readonly Candidate[],
  config: SelectionConfig,
  random: () => number,
  now: Date,
): SelectedCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  const ranked = candidates
    .map((candidate: Candidate) => ({
      candidate,
      weightedScore: computeWeightedScore(candidate, config, now),
    }))
    .sort((left, right) => right.weightedScore - left.weightedScore);

  const shouldExplore = random() < clamp(config.epsilon, 0, 1) && ranked.length > 1;
  if (shouldExplore) {
    const poolSize = Math.min(ranked.length, Math.max(1, config.topKExplorationPool));
    const offset = Math.floor(random() * poolSize);
    const explored = ranked[offset] ?? ranked[0];
    return {
      candidate: explored.candidate,
      strategy: "explore",
      weightedScore: explored.weightedScore,
    };
  }

  const best = ranked[0];
  return {
    candidate: best.candidate,
    strategy: "greedy",
    weightedScore: best.weightedScore,
  };
}
