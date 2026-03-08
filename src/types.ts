export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type EmbeddingVector = readonly number[];

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

export interface Candidate {
  readonly item: SemanticItem;
  readonly aggregate: AggregateState;
  readonly similarity: number;
}

export interface RetrieveRequest {
  readonly tribe?: string;
  readonly kind?: string;
  readonly queryVector?: EmbeddingVector;
  readonly limit?: number;
  readonly minSimilarity?: number;
  readonly includeArchived?: boolean;
}

export interface SelectionWeights {
  readonly similarity: number;
  readonly scoreAvg: number;
  readonly exploration: number;
  readonly freshness: number;
}

export interface SelectionConfig {
  readonly epsilon: number;
  readonly topKExplorationPool: number;
  readonly weights: SelectionWeights;
  readonly freshnessHalfLifeHours: number;
}

export interface SelectRequest extends RetrieveRequest {
  readonly selection?: Partial<SelectionConfig>;
}

export interface SelectedCandidate {
  readonly candidate: Candidate;
  readonly strategy: "greedy" | "explore";
  readonly weightedScore: number;
}

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

export interface OutcomeSignal {
  readonly id: string;
  readonly itemId: string;
  readonly platform: string;
  readonly occurredAt: string;
  readonly metrics: EngagementMetrics;
  readonly engagementScore: number;
  readonly payload?: JsonObject;
}

export interface CriticInput {
  readonly item: SemanticItem;
  readonly aggregateBefore: AggregateState;
  readonly outcome: OutcomeSignal;
}

export interface CriticResult {
  readonly score: number;
  readonly rationale: string;
  readonly tags: readonly string[];
  readonly meta?: JsonObject;
}

export interface AggregationConfig {
  readonly criticWeight: number;
  readonly engagementWeight: number;
  readonly decayFactor: number;
}

export interface AggregateUpdate {
  readonly itemId: string;
  readonly finalScore: number;
  readonly criticScore: number;
  readonly engagementScore: number;
  readonly occurredAt: string;
}

export interface ProcessedOutcome {
  readonly item: SemanticItem;
  readonly outcome: OutcomeSignal;
  readonly critic: CriticResult;
  readonly aggregate: AggregateState;
  readonly finalScore: number;
}

export interface LoopConfig {
  readonly selection: SelectionConfig;
  readonly aggregation: AggregationConfig;
}

export interface Critic {
  score(input: CriticInput): Promise<CriticResult>;
}

export interface MemoryStore {
  upsertItem(item: SemanticItem): Promise<void>;
  retrieve(request: RetrieveRequest): Promise<readonly Candidate[]>;
  getItem(itemId: string): Promise<SemanticItem | null>;
  getAggregate(itemId: string): Promise<AggregateState | null>;
  appendOutcome(outcome: OutcomeSignal, critic: CriticResult, finalScore: number): Promise<void>;
  updateAggregate(update: AggregateUpdate, config: AggregationConfig): Promise<AggregateState>;
}

export interface SpanLike {
  setAttribute(name: string, value: string | number | boolean): void;
  end(): void;
}

export interface Telemetry {
  startSpan(name: string): SpanLike;
}

export interface EngineOptions {
  readonly store: MemoryStore;
  readonly critic: Critic;
  readonly telemetry?: Telemetry;
  readonly config?: Partial<LoopConfig>;
  readonly random?: () => number;
  readonly now?: () => Date;
}
