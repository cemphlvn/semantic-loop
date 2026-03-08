/**
 * Multi-Signal Critic
 *
 * Composes multiple critics and merges their scores
 * with configurable weights. Useful when you want
 * heuristic + LLM + custom domain logic combined.
 */
import type { Critic, CriticInput, CriticResult, JsonObject } from "../../src/types.ts";
import { clamp } from "../../src/utils.ts";

export interface WeightedCritic {
  readonly critic: Critic;
  readonly weight: number;
  readonly name: string;
}

export interface MultiSignalCriticOptions {
  readonly critics: readonly WeightedCritic[];
}

export class MultiSignalCritic implements Critic {
  readonly #critics: readonly WeightedCritic[];
  readonly #totalWeight: number;

  public constructor(options: MultiSignalCriticOptions) {
    this.#critics = options.critics;
    this.#totalWeight = options.critics.reduce((sum, c) => sum + c.weight, 0);
  }

  public async score(input: CriticInput): Promise<CriticResult> {
    const results = await Promise.all(
      this.#critics.map(async (wc) => ({
        name: wc.name,
        weight: wc.weight,
        result: await wc.critic.score(input),
      })),
    );

    let weightedSum = 0;
    const allTags: string[] = [];
    const rationales: string[] = [];
    const breakdown: Record<string, number> = {};

    for (const r of results) {
      const normalizedWeight = r.weight / this.#totalWeight;
      weightedSum += r.result.score * normalizedWeight;
      allTags.push(...r.result.tags);
      rationales.push(`[${r.name}] ${r.result.rationale}`);
      breakdown[r.name] = r.result.score;
    }

    const uniqueTags = [...new Set(allTags)];

    return {
      score: clamp(weightedSum, 0, 1),
      rationale: rationales.join(" | "),
      tags: uniqueTags,
      meta: { breakdown } as unknown as JsonObject,
    };
  }
}
