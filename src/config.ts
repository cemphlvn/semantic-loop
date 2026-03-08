import type {
  AggregationConfig,
  Critic,
  EmbeddingProvider,
  EmbeddingVector,
  EngagementMetrics,
  IngestOptions,
  ItemInput,
  MemoryStore,
  ProcessedOutcome,
  SelectedCandidate,
  SelectionConfig,
  SelectOptions,
  SemanticItem,
  Telemetry,
} from "./types.ts";
import { ValidationError } from "./errors.ts";
import { DEFAULT_AGGREGATION_CONFIG, SemanticLoopEngine } from "./engine.ts";
import { DEFAULT_SELECTION_CONFIG, mergeSelectionConfig } from "./selection.ts";
import { deriveEngagementScore } from "./utils.ts";
import { InMemoryStore } from "./adapters/in_memory_store.ts";
import { SupabaseRpcStore } from "./adapters/supabase_rpc_store.ts";
import { HeuristicCritic } from "./critics/heuristic_critic.ts";
import { NoopEmbedding, OpenAIEmbedding } from "./embedding.ts";

// ---------------------------------------------------------------------------
// Config types — declarative, serializable, composable
// ---------------------------------------------------------------------------

/** Declarative store configuration. Pass a string shorthand, an explicit config object, or a pre-built {@link MemoryStore} instance. */
export type StoreConfig =
  | "supabase"
  | "memory"
  | {
    readonly provider: "supabase";
    readonly url: string;
    readonly serviceRoleKey: string;
  }
  | { readonly provider: "memory" }
  | MemoryStore;

/** Declarative embedding configuration. Pass a string shorthand, an explicit config object, or a pre-built {@link EmbeddingProvider} instance. */
export type EmbeddingConfig =
  | "openai"
  | {
    readonly provider: "openai";
    readonly apiKey: string;
    readonly model?: string;
    readonly dimensions?: number;
    readonly baseUrl?: string;
  }
  | EmbeddingProvider;

/** Declarative critic configuration. Pass a string shorthand, an explicit config object, or a pre-built {@link Critic} instance. */
export type CriticConfig =
  | "heuristic"
  | {
    readonly provider: "heuristic";
    readonly noveltyKeywords?: readonly string[];
    readonly penaltyKeywords?: readonly string[];
  }
  | Critic;

/** Complete declarative definition for creating a semantic loop. All fields except `store` are optional with sensible defaults. */
export interface LoopDefinition {
  readonly store: StoreConfig;
  readonly embedding?: EmbeddingConfig;
  readonly critic?: CriticConfig;
  readonly selection?: Partial<SelectionConfig>;
  readonly aggregation?: Partial<AggregationConfig>;
  readonly telemetry?: Telemetry;
}

// ---------------------------------------------------------------------------
// SemanticLoop — the high-level API
// ---------------------------------------------------------------------------

/** High-level API for the retrieve-publish-observe-critique-update loop. Wraps the engine with embedding and convenience methods. */
export interface SemanticLoop {
  seed(items: readonly ItemInput[]): Promise<readonly SemanticItem[]>;
  select(query?: string, opts?: SelectOptions): Promise<SelectedCandidate>;
  ingest(
    itemId: string,
    platform: string,
    metrics: EngagementMetrics,
    opts?: IngestOptions,
  ): Promise<ProcessedOutcome>;
  readonly engine: SemanticLoopEngine;
  readonly embedder: EmbeddingProvider;
  readonly store: MemoryStore;
}

// ---------------------------------------------------------------------------
// Resolvers — turn declarative config into wired instances
// ---------------------------------------------------------------------------

function envRequired(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new ValidationError(
      `Environment variable ${name} is required. Either set it or pass the value explicitly.`,
    );
  }
  return value;
}

function isMemoryStore(value: unknown): value is MemoryStore {
  return typeof value === "object" && value !== null && "upsertItem" in value;
}

function isEmbeddingProvider(value: unknown): value is EmbeddingProvider {
  return typeof value === "object" && value !== null && "embed" in value &&
    "dimensions" in value;
}

function isCritic(value: unknown): value is Critic {
  return typeof value === "object" && value !== null && "score" in value;
}

function resolveStore(config: StoreConfig): MemoryStore {
  if (isMemoryStore(config)) return config;

  if (config === "memory") return new InMemoryStore();
  if (typeof config === "object" && config.provider === "memory") {
    return new InMemoryStore();
  }

  if (config === "supabase") {
    return new SupabaseRpcStore({
      url: envRequired("SUPABASE_URL"),
      serviceRoleKey: envRequired("SUPABASE_SERVICE_ROLE_KEY"),
    });
  }

  if (typeof config === "object" && config.provider === "supabase") {
    return new SupabaseRpcStore({
      url: config.url,
      serviceRoleKey: config.serviceRoleKey,
    });
  }

  throw new ValidationError("Invalid store configuration.");
}

function resolveEmbedding(config?: EmbeddingConfig): EmbeddingProvider {
  if (!config) return new NoopEmbedding();
  if (isEmbeddingProvider(config)) return config;

  if (config === "openai") {
    return new OpenAIEmbedding({ apiKey: envRequired("OPENAI_API_KEY") });
  }

  if (typeof config === "object" && config.provider === "openai") {
    return new OpenAIEmbedding({
      apiKey: config.apiKey,
      model: config.model,
      dimensions: config.dimensions,
      baseUrl: config.baseUrl,
    });
  }

  throw new ValidationError("Invalid embedding configuration.");
}

function resolveCritic(config?: CriticConfig): Critic {
  if (!config || config === "heuristic") return new HeuristicCritic();
  if (isCritic(config)) return config;

  if (typeof config === "object" && config.provider === "heuristic") {
    return new HeuristicCritic({
      noveltyKeywords: config.noveltyKeywords ? [...config.noveltyKeywords] : undefined,
      penaltyKeywords: config.penaltyKeywords ? [...config.penaltyKeywords] : undefined,
    });
  }

  throw new ValidationError("Invalid critic configuration.");
}

// ---------------------------------------------------------------------------
// Item construction
// ---------------------------------------------------------------------------

function buildItem(input: ItemInput, embedding: EmbeddingVector): SemanticItem {
  const now = new Date().toISOString();
  return {
    id: input.id ?? crypto.randomUUID(),
    tribe: input.tribe ?? "default",
    kind: input.kind ?? "item",
    content: input.content,
    embedding,
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a fully wired {@link SemanticLoop} from a declarative {@link LoopDefinition}. Resolves store, embedding, and critic configs into concrete instances. */
export function createLoop(definition: LoopDefinition): SemanticLoop {
  const store = resolveStore(definition.store);
  const embedder = resolveEmbedding(definition.embedding);
  const critic = resolveCritic(definition.critic);

  const engine = new SemanticLoopEngine({
    store,
    critic,
    telemetry: definition.telemetry,
    config: {
      selection: definition.selection
        ? mergeSelectionConfig(definition.selection)
        : DEFAULT_SELECTION_CONFIG,
      aggregation: definition.aggregation
        ? {
          criticWeight: definition.aggregation.criticWeight ??
            DEFAULT_AGGREGATION_CONFIG.criticWeight,
          engagementWeight: definition.aggregation.engagementWeight ??
            DEFAULT_AGGREGATION_CONFIG.engagementWeight,
          decayFactor: definition.aggregation.decayFactor ??
            DEFAULT_AGGREGATION_CONFIG.decayFactor,
        }
        : DEFAULT_AGGREGATION_CONFIG,
    },
  });

  return {
    engine,
    embedder,
    store,

    async seed(items: readonly ItemInput[]): Promise<readonly SemanticItem[]> {
      const needsEmbedding = items.filter((i) => !i.embedding);
      let batchEmbeddings: readonly EmbeddingVector[] = [];

      if (needsEmbedding.length > 0 && embedder.embedBatch) {
        batchEmbeddings = await embedder.embedBatch(
          needsEmbedding.map((i) => i.content),
        );
      }

      const seeded: SemanticItem[] = [];
      let batchIdx = 0;

      for (const input of items) {
        let embedding: EmbeddingVector;
        if (input.embedding) {
          embedding = input.embedding;
        } else if (batchEmbeddings.length > 0) {
          embedding = batchEmbeddings[batchIdx++] ?? [];
        } else {
          embedding = await embedder.embed(input.content);
        }
        seeded.push(buildItem(input, embedding));
      }

      await engine.seed(seeded);
      return seeded;
    },

    async select(
      query?: string,
      opts?: SelectOptions,
    ): Promise<SelectedCandidate> {
      const queryVector = query && embedder.dimensions > 0
        ? await embedder.embed(query)
        : undefined;

      return engine.selectNext({
        tribe: opts?.tribe,
        kind: opts?.kind,
        queryVector,
        limit: opts?.limit,
        minSimilarity: opts?.minSimilarity,
        includeArchived: opts?.includeArchived,
        selection: opts?.selection,
      });
    },

    async ingest(
      itemId: string,
      platform: string,
      metrics: EngagementMetrics,
      opts?: IngestOptions,
    ): Promise<ProcessedOutcome> {
      return engine.ingestOutcome({
        id: opts?.id ?? crypto.randomUUID(),
        itemId,
        platform,
        occurredAt: opts?.occurredAt ?? new Date().toISOString(),
        metrics,
        engagementScore: opts?.engagementScore ??
          deriveEngagementScore(metrics),
        payload: opts?.payload,
      });
    },
  };
}
