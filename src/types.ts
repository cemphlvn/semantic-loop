/** A JSON-compatible primitive value. */
export type JsonPrimitive = string | number | boolean | null;

/** Any valid JSON value: primitive, object, or array. */
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

/** A readonly JSON object with string keys. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** A dense vector representation of text, used for similarity search. */
export type EmbeddingVector = readonly number[];

/** A content item stored in the retrieval system with its embedding. */
export interface SemanticItem {
  readonly id: string;
  readonly tribe: string;
  readonly kind: string;
  readonly content: string;
  readonly embedding: EmbeddingVector;
  readonly metadata: JsonObject;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt?: string;
}

/** Running statistics for a single item, updated each time an outcome is recorded. */
export interface AggregateState {
  readonly itemId: string;
  readonly attempts: number;
  readonly scoreSum: number;
  readonly scoreAvg: number;
  readonly criticAvg: number;
  readonly engagementAvg: number;
  readonly lastScore?: number;
  readonly lastCriticScore?: number;
  readonly lastEngagementScore?: number;
  readonly lastOutcomeAt?: string;
  readonly updatedAt: string;
}

/** A retrieval result combining the item, its aggregate state, and query similarity. */
export interface Candidate {
  readonly item: SemanticItem;
  readonly aggregate: AggregateState;
  readonly similarity: number;
}

/** Query parameters for retrieving candidates from the store. */
export interface RetrieveRequest {
  readonly tribe?: string;
  readonly kind?: string;
  readonly queryVector?: EmbeddingVector;
  readonly limit?: number;
  readonly minSimilarity?: number;
  readonly includeArchived?: boolean;
}

/** Weights for the four scoring dimensions used during candidate selection. */
export interface SelectionWeights {
  readonly similarity: number;
  readonly scoreAvg: number;
  readonly exploration: number;
  readonly freshness: number;
}

/** Full configuration for the epsilon-greedy selection algorithm. */
export interface SelectionConfig {
  readonly epsilon: number;
  readonly topKExplorationPool: number;
  readonly weights: SelectionWeights;
  readonly freshnessHalfLifeHours: number;
}

/** Retrieval request extended with optional selection algorithm overrides. */
export interface SelectRequest extends RetrieveRequest {
  readonly selection?: Partial<SelectionConfig>;
}

/** The result of selection: a candidate annotated with strategy and weighted score. */
export interface SelectedCandidate {
  readonly candidate: Candidate;
  readonly strategy: "greedy" | "explore";
  readonly weightedScore: number;
}

/** Raw platform engagement metrics for a single outcome event. */
export interface EngagementMetrics {
  readonly impressions?: number;
  readonly views?: number;
  readonly watchSeconds?: number;
  readonly avgWatchSeconds?: number;
  readonly likes?: number;
  readonly comments?: number;
  readonly shares?: number;
  readonly saves?: number;
  readonly clicks?: number;
  readonly conversions?: number;
}

/** A recorded outcome event linking an item to its real-world performance. */
export interface OutcomeSignal {
  readonly id: string;
  readonly itemId: string;
  readonly platform: string;
  readonly occurredAt: string;
  readonly metrics: EngagementMetrics;
  readonly engagementScore: number;
  readonly payload?: JsonObject;
}

/** Input provided to a critic for scoring an item after an outcome. */
export interface CriticInput {
  readonly item: SemanticItem;
  readonly aggregateBefore: AggregateState;
  readonly outcome: OutcomeSignal;
}

/** A critic's evaluation: a clamped score, human-readable rationale, and tags. */
export interface CriticResult {
  readonly score: number;
  readonly rationale: string;
  readonly tags: readonly string[];
  readonly meta?: JsonObject;
}

/** Controls how critic and engagement scores are blended and decayed over time. */
export interface AggregationConfig {
  readonly criticWeight: number;
  readonly engagementWeight: number;
  readonly decayFactor: number;
}

/** Data needed to update an item's aggregate state after scoring. */
export interface AggregateUpdate {
  readonly itemId: string;
  readonly finalScore: number;
  readonly criticScore: number;
  readonly engagementScore: number;
  readonly occurredAt: string;
}

/** Full result of ingesting an outcome: the item, outcome, critic result, updated aggregate, and any bred variations. */
export interface ProcessedOutcome {
  readonly item: SemanticItem;
  readonly outcome: OutcomeSignal;
  readonly critic: CriticResult;
  readonly aggregate: AggregateState;
  readonly finalScore: number;
  readonly bredInputs?: readonly ItemInput[];
}

/** Configuration for the breeding subsystem: thresholds, limits, and safety guards. */
export interface BreederConfig {
  readonly scoreThreshold: number;
  readonly minAttempts: number;
  readonly maxChildrenPerBreed: number;
  readonly maxGeneration: number;
  readonly cooldownHours: number;
}

/** Context provided to a Breeder when an item crosses the breeding threshold. */
export interface BreedContext {
  readonly item: SemanticItem;
  readonly aggregate: AggregateState;
  readonly critic: CriticResult;
  readonly outcome: OutcomeSignal;
  readonly finalScore: number;
  readonly generation: number;
  readonly config: BreederConfig;
}

/** Strategy for growing the item pool. Called when high-performing items cross a score threshold. */
export interface Breeder {
  breed(context: BreedContext): Promise<readonly ItemInput[]>;
}

/** Combined selection, aggregation, and breeding configuration for the loop. */
export interface LoopConfig {
  readonly selection: SelectionConfig;
  readonly aggregation: AggregationConfig;
  readonly breeding: BreederConfig;
}

/** Deep-partial version of LoopConfig for use in EngineOptions. */
export interface PartialLoopConfig {
  readonly selection?: Partial<SelectionConfig>;
  readonly aggregation?: Partial<AggregationConfig>;
  readonly breeding?: Partial<BreederConfig>;
}

/** Scores an item after an outcome is observed. Plugin boundary for evaluation logic. */
export interface Critic {
  score(input: CriticInput): Promise<CriticResult>;
}

/** Persistence layer for items, aggregates, and outcomes. Plugin boundary for storage backends. */
export interface MemoryStore {
  upsertItem(item: SemanticItem): Promise<void>;
  retrieve(request: RetrieveRequest): Promise<readonly Candidate[]>;
  getItem(itemId: string): Promise<SemanticItem | null>;
  getAggregate(itemId: string): Promise<AggregateState | null>;
  appendOutcome(outcome: OutcomeSignal, critic: CriticResult, finalScore: number): Promise<void>;
  updateAggregate(update: AggregateUpdate, config: AggregationConfig): Promise<AggregateState>;
}

/** Minimal tracing span compatible with OpenTelemetry and similar providers. */
export interface SpanLike {
  setAttribute(name: string, value: string | number | boolean): void;
  end(): void;
}

/** Observability provider. Default is NoopTelemetry for zero overhead. */
export interface Telemetry {
  startSpan(name: string): SpanLike;
}

/** Constructor options for SemanticLoopEngine. */
export interface EngineOptions {
  readonly store: MemoryStore;
  readonly critic: Critic;
  readonly breeder?: Breeder;
  readonly telemetry?: Telemetry;
  readonly config?: PartialLoopConfig;
  readonly random?: () => number;
  readonly now?: () => Date;
}

/** Turns text into embedding vectors. Used by the high-level createLoop API. */
export interface EmbeddingProvider {
  embed(text: string): Promise<EmbeddingVector>;
  embedBatch?(texts: readonly string[]): Promise<readonly EmbeddingVector[]>;
  readonly dimensions: number;
}

/** Simplified input for seeding items via createLoop. */
export interface ItemInput {
  readonly content: string;
  readonly tribe?: string;
  readonly kind?: string;
  readonly id?: string;
  readonly metadata?: JsonObject;
  readonly embedding?: EmbeddingVector;
}

/** Simplified selection options for the createLoop.select() helper. */
export interface SelectOptions {
  readonly tribe?: string;
  readonly kind?: string;
  readonly limit?: number;
  readonly minSimilarity?: number;
  readonly includeArchived?: boolean;
  readonly selection?: Partial<SelectionConfig>;
}

/** Simplified ingestion options for the createLoop.ingest() helper. */
export interface IngestOptions {
  readonly id?: string;
  readonly occurredAt?: string;
  readonly engagementScore?: number;
  readonly payload?: JsonObject;
}
