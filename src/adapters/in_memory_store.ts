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
} from "../types.ts";
import { clamp, cosineSimilarity, defaultAggregate } from "../utils.ts";

/** In-memory implementation of {@link MemoryStore} backed by plain Maps. Useful for testing and prototyping. */
export class InMemoryStore implements MemoryStore {
  readonly #items: Map<string, SemanticItem>;
  readonly #aggregates: Map<string, AggregateState>;
  readonly #outcomes: Map<
    string,
    { outcome: OutcomeSignal; critic: CriticResult; finalScore: number }
  >;
  readonly #now: () => Date;

  public constructor(now?: () => Date) {
    this.#items = new Map<string, SemanticItem>();
    this.#aggregates = new Map<string, AggregateState>();
    this.#outcomes = new Map<
      string,
      { outcome: OutcomeSignal; critic: CriticResult; finalScore: number }
    >();
    this.#now = now ?? (() => new Date());
  }

  public async upsertItem(item: SemanticItem): Promise<void> {
    this.#items.set(item.id, item);
    if (!this.#aggregates.has(item.id)) {
      this.#aggregates.set(item.id, defaultAggregate(item.id, this.#now().toISOString()));
    }
  }

  public async retrieve(request: RetrieveRequest): Promise<readonly Candidate[]> {
    const limit = request.limit ?? 8;
    const minSimilarity = request.minSimilarity ?? 0;
    const rows: Candidate[] = [];

    for (const item of this.#items.values()) {
      if (request.tribe && item.tribe !== request.tribe) {
        continue;
      }
      if (request.kind && item.kind !== request.kind) {
        continue;
      }
      if (!request.includeArchived && item.archivedAt) {
        continue;
      }

      const aggregate = this.#aggregates.get(item.id) ??
        defaultAggregate(item.id, this.#now().toISOString());
      const similarity = request.queryVector
        ? cosineSimilarity(item.embedding, request.queryVector)
        : 0.5;
      if (similarity < minSimilarity) {
        continue;
      }

      rows.push({ item, aggregate, similarity });
    }

    rows.sort((left, right) => {
      if (right.similarity !== left.similarity) {
        return right.similarity - left.similarity;
      }
      return right.aggregate.scoreAvg - left.aggregate.scoreAvg;
    });

    return rows.slice(0, limit);
  }

  public async getItem(itemId: string): Promise<SemanticItem | null> {
    return this.#items.get(itemId) ?? null;
  }

  public async getAggregate(itemId: string): Promise<AggregateState | null> {
    return this.#aggregates.get(itemId) ?? null;
  }

  public async appendOutcome(
    outcome: OutcomeSignal,
    critic: CriticResult,
    finalScore: number,
  ): Promise<void> {
    this.#outcomes.set(outcome.id, { outcome, critic, finalScore });
  }

  public async updateAggregate(
    update: AggregateUpdate,
    config: AggregationConfig,
  ): Promise<AggregateState> {
    const existing = this.#aggregates.get(update.itemId) ??
      defaultAggregate(update.itemId, this.#now().toISOString());
    const attempts = existing.attempts + 1;
    const decayedScoreSum = existing.scoreSum * clamp(config.decayFactor, 0, 1);
    const scoreSum = decayedScoreSum + update.finalScore;
    const scoreAvg = attempts > 0 ? scoreSum / attempts : 0;

    const criticAvg = ((existing.criticAvg * existing.attempts) + update.criticScore) / attempts;
    const engagementAvg = ((existing.engagementAvg * existing.attempts) + update.engagementScore) /
      attempts;

    const next: AggregateState = {
      itemId: update.itemId,
      attempts,
      scoreSum,
      scoreAvg: clamp(scoreAvg, 0, 1),
      criticAvg: clamp(criticAvg, 0, 1),
      engagementAvg: clamp(engagementAvg, 0, 1),
      lastScore: update.finalScore,
      lastCriticScore: update.criticScore,
      lastEngagementScore: update.engagementScore,
      lastOutcomeAt: update.occurredAt,
      updatedAt: this.#now().toISOString(),
    };

    this.#aggregates.set(update.itemId, next);
    return next;
  }
}
