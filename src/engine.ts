import { NoopBreeder } from "./breeder.ts";
import { NotFoundError, ValidationError } from "./errors.ts";
import { DEFAULT_SELECTION_CONFIG, mergeSelectionConfig, selectCandidate } from "./selection.ts";
import { NoopTelemetry } from "./telemetry.ts";
import type {
  AggregateUpdate,
  AggregationConfig,
  BreedContext,
  Breeder,
  BreederConfig,
  EngineOptions,
  ItemInput,
  LoopConfig,
  OutcomeSignal,
  ProcessedOutcome,
  SelectedCandidate,
  SelectRequest,
  SemanticItem,
} from "./types.ts";
import { clamp, defaultAggregate } from "./utils.ts";

/** Default aggregation config: 60% critic, 40% engagement, 0.95 decay. */
export const DEFAULT_AGGREGATION_CONFIG: AggregationConfig = {
  criticWeight: 0.6,
  engagementWeight: 0.4,
  decayFactor: 0.95,
};

/** Default breeder config: breed when finalScore >= 0.7, max 3 children, max 2 generations, 24h cooldown. */
export const DEFAULT_BREEDER_CONFIG: BreederConfig = {
  scoreThreshold: 0.7,
  minAttempts: 1,
  maxChildrenPerBreed: 3,
  maxGeneration: 2,
  cooldownHours: 24,
};

/** Default loop config combining selection, aggregation, and breeding defaults. */
export const DEFAULT_LOOP_CONFIG: LoopConfig = {
  selection: DEFAULT_SELECTION_CONFIG,
  aggregation: DEFAULT_AGGREGATION_CONFIG,
  breeding: DEFAULT_BREEDER_CONFIG,
};

/**
 * Orchestrates the retrieve-publish-observe-critique-update loop.
 * Stateless per request; all durable state lives in the configured store.
 */
export class SemanticLoopEngine {
  readonly #store: EngineOptions["store"];
  readonly #critic: EngineOptions["critic"];
  readonly #breeder: Breeder;
  readonly #telemetry: NoopTelemetry | NonNullable<EngineOptions["telemetry"]>;
  readonly #config: LoopConfig;
  readonly #random: () => number;
  readonly #now: () => Date;

  public constructor(options: EngineOptions) {
    this.#store = options.store;
    this.#critic = options.critic;
    this.#breeder = options.breeder ?? new NoopBreeder();
    this.#telemetry = options.telemetry ?? new NoopTelemetry();
    this.#config = {
      selection: mergeSelectionConfig(options.config?.selection),
      aggregation: {
        criticWeight: options.config?.aggregation?.criticWeight ??
          DEFAULT_AGGREGATION_CONFIG.criticWeight,
        engagementWeight: options.config?.aggregation?.engagementWeight ??
          DEFAULT_AGGREGATION_CONFIG.engagementWeight,
        decayFactor: options.config?.aggregation?.decayFactor ??
          DEFAULT_AGGREGATION_CONFIG.decayFactor,
      },
      breeding: {
        scoreThreshold: options.config?.breeding?.scoreThreshold ??
          DEFAULT_BREEDER_CONFIG.scoreThreshold,
        minAttempts: options.config?.breeding?.minAttempts ??
          DEFAULT_BREEDER_CONFIG.minAttempts,
        maxChildrenPerBreed: options.config?.breeding?.maxChildrenPerBreed ??
          DEFAULT_BREEDER_CONFIG.maxChildrenPerBreed,
        maxGeneration: options.config?.breeding?.maxGeneration ??
          DEFAULT_BREEDER_CONFIG.maxGeneration,
        cooldownHours: options.config?.breeding?.cooldownHours ??
          DEFAULT_BREEDER_CONFIG.cooldownHours,
      },
    };
    this.#random = options.random ?? Math.random;
    this.#now = options.now ?? (() => new Date());
  }

  /** Upsert one or more items into the store, validating each before writing. */
  public async seed(items: readonly SemanticItem[]): Promise<void> {
    const span = this.#telemetry.startSpan("semantic_loop.seed");
    span.setAttribute("items.count", items.length);

    try {
      for (const item of items) {
        this.#validateItem(item);
        await this.#store.upsertItem(item);
      }
    } finally {
      span.end();
    }
  }

  /** Retrieve candidates from the store and select the best one via epsilon-greedy. */
  public async selectNext(request: SelectRequest): Promise<SelectedCandidate> {
    const span = this.#telemetry.startSpan("semantic_loop.select_next");
    span.setAttribute("tribe", request.tribe ?? "*");
    span.setAttribute("kind", request.kind ?? "*");

    try {
      const candidates = await this.#store.retrieve({
        tribe: request.tribe,
        kind: request.kind,
        queryVector: request.queryVector,
        limit: request.limit,
        minSimilarity: request.minSimilarity,
        includeArchived: request.includeArchived,
      });

      const selected = selectCandidate(
        candidates,
        mergeSelectionConfig(request.selection ?? this.#config.selection),
        this.#random,
        this.#now(),
      );

      if (!selected) {
        throw new NotFoundError("No candidates matched the retrieval query.");
      }

      span.setAttribute("selection.strategy", selected.strategy);
      span.setAttribute("selection.score", selected.weightedScore);
      return selected;
    } finally {
      span.end();
    }
  }

  /** Score an outcome via the critic, record it, and update the item's aggregate. */
  public async ingestOutcome(outcome: OutcomeSignal): Promise<ProcessedOutcome> {
    const span = this.#telemetry.startSpan("semantic_loop.ingest_outcome");
    span.setAttribute("item.id", outcome.itemId);
    span.setAttribute("platform", outcome.platform);

    try {
      this.#validateOutcome(outcome);
      const item = await this.#store.getItem(outcome.itemId);
      if (!item) {
        throw new NotFoundError(`Item ${outcome.itemId} was not found.`);
      }

      const aggregateBefore = await this.#store.getAggregate(outcome.itemId) ??
        defaultAggregate(outcome.itemId, this.#now().toISOString());
      const critic = await this.#critic.score({ item, aggregateBefore, outcome });
      const finalScore = this.#combineScores(critic.score, outcome.engagementScore);

      await this.#store.appendOutcome(outcome, critic, finalScore);

      const update: AggregateUpdate = {
        itemId: outcome.itemId,
        criticScore: critic.score,
        engagementScore: outcome.engagementScore,
        finalScore,
        occurredAt: outcome.occurredAt,
      };
      const aggregate = await this.#store.updateAggregate(update, this.#config.aggregation);

      span.setAttribute("critic.score", critic.score);
      span.setAttribute("final.score", finalScore);

      // --- Breeding ---
      let bredInputs: readonly ItemInput[] | undefined;
      const generation = typeof item.metadata.generation === "number"
        ? item.metadata.generation
        : 0;

      if (this.#shouldBreed(finalScore, aggregate, generation, item)) {
        const breedSpan = this.#telemetry.startSpan("semantic_loop.breed");
        try {
          const breedContext: BreedContext = {
            item,
            aggregate,
            critic,
            outcome,
            finalScore,
            generation,
            config: this.#config.breeding,
          };
          const raw = await this.#breeder.breed(breedContext);
          bredInputs = raw.slice(0, this.#config.breeding.maxChildrenPerBreed)
            .map((input) => ({
              ...input,
              tribe: input.tribe ?? item.tribe,
              kind: input.kind ?? item.kind,
              metadata: {
                ...(input.metadata ?? {}),
                parentId: item.id,
                generation: generation + 1,
                bredAt: this.#now().toISOString(),
              },
            }));
          breedSpan.setAttribute("breed.count", bredInputs.length);
          breedSpan.setAttribute("breed.generation", generation + 1);

          // Mark parent as recently bred for cooldown tracking
          if (bredInputs.length > 0) {
            await this.#store.upsertItem({
              ...item,
              metadata: {
                ...item.metadata,
                lastBredAt: this.#now().toISOString(),
              },
              updatedAt: this.#now().toISOString(),
            });
          }
        } finally {
          breedSpan.end();
        }
      }

      return {
        item,
        outcome,
        critic,
        aggregate,
        finalScore,
        bredInputs,
      };
    } finally {
      span.end();
    }
  }

  #shouldBreed(
    finalScore: number,
    aggregate: { readonly attempts: number },
    generation: number,
    item: SemanticItem,
  ): boolean {
    const cfg = this.#config.breeding;
    if (finalScore < cfg.scoreThreshold) return false;
    if (aggregate.attempts < cfg.minAttempts) return false;
    if (generation >= cfg.maxGeneration) return false;

    const lastBredAt = item.metadata.lastBredAt;
    if (typeof lastBredAt === "string") {
      const hoursSince = (this.#now().getTime() - Date.parse(lastBredAt)) /
        3_600_000;
      if (hoursSince < cfg.cooldownHours) return false;
    }

    return true;
  }

  #combineScores(criticScore: number, engagementScore: number): number {
    const weights = this.#config.aggregation;
    return clamp(
      criticScore * weights.criticWeight + engagementScore * weights.engagementWeight,
      0,
      1,
    );
  }

  #validateItem(item: SemanticItem): void {
    if (!item.id) {
      throw new ValidationError("Item id is required.");
    }
    if (!item.tribe) {
      throw new ValidationError("Item tribe is required.");
    }
    if (!item.kind) {
      throw new ValidationError("Item kind is required.");
    }
    if (!item.content) {
      throw new ValidationError("Item content is required.");
    }
  }

  #validateOutcome(outcome: OutcomeSignal): void {
    if (!outcome.id) {
      throw new ValidationError("Outcome id is required.");
    }
    if (!outcome.itemId) {
      throw new ValidationError("Outcome itemId is required.");
    }
    if (!outcome.platform) {
      throw new ValidationError("Outcome platform is required.");
    }
    if (!outcome.occurredAt) {
      throw new ValidationError("Outcome occurredAt is required.");
    }
    if (!Number.isFinite(outcome.engagementScore)) {
      throw new ValidationError("Outcome engagementScore must be a finite number.");
    }
  }
}
