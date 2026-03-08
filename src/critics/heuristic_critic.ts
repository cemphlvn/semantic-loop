import type { Critic, CriticInput, CriticResult } from "../types.ts";
import { clamp } from "../utils.ts";

/** Configuration for {@link HeuristicCritic}. */
export interface HeuristicCriticOptions {
  /** Keywords that boost the score when found in content (e.g. "why", "framework"). */
  readonly noveltyKeywords?: readonly string[];
  /** Keywords that penalise the score when found in content (e.g. "guaranteed", "viral"). */
  readonly penaltyKeywords?: readonly string[];
}

/** Keyword-based {@link Critic} that scores content using novelty/penalty keyword matching and engagement signals. */
export class HeuristicCritic implements Critic {
  readonly #noveltyKeywords: readonly string[];
  readonly #penaltyKeywords: readonly string[];

  public constructor(options?: HeuristicCriticOptions) {
    this.#noveltyKeywords = options?.noveltyKeywords ?? [
      "why",
      "mistake",
      "hidden",
      "counterintuitive",
      "framework",
      "moat",
      "compounding",
    ];
    this.#penaltyKeywords = options?.penaltyKeywords ?? [
      "ultimate",
      "best ever",
      "guaranteed",
      "viral",
    ];
  }

  public async score(input: CriticInput): Promise<CriticResult> {
    const normalized = input.item.content.toLowerCase();
    const noveltyHits =
      this.#noveltyKeywords.filter((keyword: string) => normalized.includes(keyword)).length;
    const penaltyHits =
      this.#penaltyKeywords.filter((keyword: string) => normalized.includes(keyword)).length;

    const engagementBoost = input.outcome.engagementScore * 0.6;
    const noveltyBoost = Math.min(0.25, noveltyHits * 0.06);
    const penalty = Math.min(0.2, penaltyHits * 0.05);
    const historicalStability = input.aggregateBefore.attempts > 0
      ? Math.min(0.15, input.aggregateBefore.scoreAvg * 0.15)
      : 0;

    const score = clamp(0.2 + engagementBoost + noveltyBoost + historicalStability - penalty, 0, 1);

    return {
      score,
      rationale: penaltyHits > 0
        ? "Strong performance signal, but language contains some hype-heavy tokens that reduce quality confidence."
        : "Performance and wording suggest this item preserved attention without excessive hype.",
      tags: [
        ...(noveltyHits > 0 ? ["novelty"] : []),
        ...(penaltyHits > 0 ? ["hype-risk"] : []),
        ...(input.outcome.engagementScore >= 0.5 ? ["validated"] : ["needs-more-data"]),
      ],
      meta: {
        noveltyHits,
        penaltyHits,
      },
    };
  }
}
