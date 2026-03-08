/**
 * Multi-Platform Store
 *
 * Wraps a primary MemoryStore and adds cross-platform
 * signal normalization. Outcomes from different platforms
 * (Instagram, TikTok, LinkedIn, X, Newsletter) get
 * normalized to comparable scales before storage.
 *
 * This solves the "10k views on TikTok ≠ 10k views on LinkedIn" problem.
 */
import type {
  AggregateState,
  AggregateUpdate,
  AggregationConfig,
  Candidate,
  CriticResult,
  MemoryStore,
  OutcomeSignal,
  RetrieveRequest,
  SemanticItem,
} from "../../src/types.ts";
import { clamp } from "../../src/utils.ts";

export interface PlatformNormalization {
  readonly viewsBaseline: number;
  readonly engagementMultiplier: number;
}

export interface MultiPlatformStoreOptions {
  readonly store: MemoryStore;
  readonly platforms: Record<string, PlatformNormalization>;
}

const DEFAULT_PLATFORMS: Record<string, PlatformNormalization> = {
  instagram: { viewsBaseline: 5000, engagementMultiplier: 1.0 },
  tiktok: { viewsBaseline: 50000, engagementMultiplier: 0.6 },
  linkedin: { viewsBaseline: 1000, engagementMultiplier: 1.8 },
  x: { viewsBaseline: 3000, engagementMultiplier: 1.1 },
  youtube: { viewsBaseline: 10000, engagementMultiplier: 0.8 },
  newsletter: { viewsBaseline: 500, engagementMultiplier: 2.0 },
};

export class MultiPlatformStore implements MemoryStore {
  readonly #inner: MemoryStore;
  readonly #platforms: Record<string, PlatformNormalization>;

  public constructor(options: MultiPlatformStoreOptions) {
    this.#inner = options.store;
    this.#platforms = { ...DEFAULT_PLATFORMS, ...options.platforms };
  }

  public async upsertItem(item: SemanticItem): Promise<void> {
    return this.#inner.upsertItem(item);
  }

  public async retrieve(request: RetrieveRequest): Promise<readonly Candidate[]> {
    return this.#inner.retrieve(request);
  }

  public async getItem(itemId: string): Promise<SemanticItem | null> {
    return this.#inner.getItem(itemId);
  }

  public async getAggregate(itemId: string): Promise<AggregateState | null> {
    return this.#inner.getAggregate(itemId);
  }

  public async appendOutcome(
    outcome: OutcomeSignal,
    critic: CriticResult,
    finalScore: number,
  ): Promise<void> {
    const normalized = this.#normalizeOutcome(outcome);
    return this.#inner.appendOutcome(normalized, critic, finalScore);
  }

  public async updateAggregate(
    update: AggregateUpdate,
    config: AggregationConfig,
  ): Promise<AggregateState> {
    return this.#inner.updateAggregate(update, config);
  }

  #normalizeOutcome(outcome: OutcomeSignal): OutcomeSignal {
    const norm = this.#platforms[outcome.platform];
    if (!norm) return outcome;

    const views = outcome.metrics.views ?? outcome.metrics.impressions ?? 0;
    const normalizedEngagement = clamp(
      outcome.engagementScore * norm.engagementMultiplier * (views / norm.viewsBaseline),
      0,
      1,
    );

    return {
      ...outcome,
      engagementScore: normalizedEngagement,
    };
  }
}
