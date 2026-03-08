import type {
  AggregateState,
  AggregateUpdate,
  AggregationConfig,
  Candidate,
  CriticResult,
  JsonObject,
  MemoryStore,
  OutcomeSignal,
  RetrieveRequest,
  SemanticItem,
} from "../types.ts";
import { defaultAggregate } from "../utils.ts";

interface SupabaseRpcNames {
  readonly upsertItem: string;
  readonly matchItems: string;
  readonly recordOutcome: string;
  readonly applyOutcome: string;
}

export interface SupabaseRpcStoreOptions {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly itemsTable?: string;
  readonly aggregatesTable?: string;
  readonly rpc?: Partial<SupabaseRpcNames>;
  readonly fetcher?: typeof fetch;
}

interface RpcMatchRow {
  readonly id: string;
  readonly tribe: string;
  readonly kind: string;
  readonly content: string;
  readonly metadata: JsonObject;
  readonly created_at: string;
  readonly updated_at: string;
  readonly archived_at?: string;
  readonly score_avg?: number;
  readonly score_sum?: number;
  readonly critic_avg?: number;
  readonly engagement_avg?: number;
  readonly attempts?: number;
  readonly last_score?: number;
  readonly last_critic_score?: number;
  readonly last_engagement_score?: number;
  readonly last_outcome_at?: string;
  readonly similarity: number;
}

interface RpcAggregateRow {
  readonly item_id: string;
  readonly attempts: number;
  readonly score_sum: number;
  readonly score_avg: number;
  readonly critic_avg: number;
  readonly engagement_avg: number;
  readonly last_score?: number;
  readonly last_critic_score?: number;
  readonly last_engagement_score?: number;
  readonly last_outcome_at?: string;
  readonly updated_at: string;
}

export class SupabaseRpcStore implements MemoryStore {
  readonly #url: string;
  readonly #serviceRoleKey: string;
  readonly #itemsTable: string;
  readonly #aggregatesTable: string;
  readonly #rpc: SupabaseRpcNames;
  readonly #fetcher: typeof fetch;

  public constructor(options: SupabaseRpcStoreOptions) {
    this.#url = options.url.replace(/\/$/, "");
    this.#serviceRoleKey = options.serviceRoleKey;
    this.#itemsTable = options.itemsTable ?? "semantic_items";
    this.#aggregatesTable = options.aggregatesTable ?? "semantic_item_scores";
    this.#rpc = {
      upsertItem: options.rpc?.upsertItem ?? "sl_upsert_item",
      matchItems: options.rpc?.matchItems ?? "sl_match_items",
      recordOutcome: options.rpc?.recordOutcome ?? "sl_record_outcome",
      applyOutcome: options.rpc?.applyOutcome ?? "sl_apply_outcome",
    };
    this.#fetcher = options.fetcher ?? fetch;
  }

  public async upsertItem(item: SemanticItem): Promise<void> {
    await this.#rpcPost<void>(this.#rpc.upsertItem, {
      p_id: item.id,
      p_tribe: item.tribe,
      p_kind: item.kind,
      p_content: item.content,
      p_embedding: [...item.embedding],
      p_metadata: item.metadata,
      p_created_at: item.createdAt,
      p_updated_at: item.updatedAt,
      p_archived_at: item.archivedAt ?? null,
    });
  }

  public async retrieve(request: RetrieveRequest): Promise<readonly Candidate[]> {
    const rows = await this.#rpcPost<readonly RpcMatchRow[]>(this.#rpc.matchItems, {
      p_tribe: request.tribe ?? null,
      p_kind: request.kind ?? null,
      p_query_embedding: request.queryVector ? [...request.queryVector] : null,
      p_limit: request.limit ?? 8,
      p_min_similarity: request.minSimilarity ?? 0,
      p_include_archived: request.includeArchived ?? false,
    });

    return rows.map((row: RpcMatchRow) => ({
      item: {
        id: row.id,
        tribe: row.tribe,
        kind: row.kind,
        content: row.content,
        embedding: [],
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        archivedAt: row.archived_at,
      },
      aggregate: {
        itemId: row.id,
        attempts: row.attempts ?? 0,
        scoreSum: row.score_sum ?? 0,
        scoreAvg: row.score_avg ?? 0,
        criticAvg: row.critic_avg ?? 0,
        engagementAvg: row.engagement_avg ?? 0,
        lastScore: row.last_score,
        lastCriticScore: row.last_critic_score,
        lastEngagementScore: row.last_engagement_score,
        lastOutcomeAt: row.last_outcome_at,
        updatedAt: row.updated_at,
      },
      similarity: row.similarity,
    }));
  }

  public async getItem(itemId: string): Promise<SemanticItem | null> {
    const query = new URLSearchParams({
      select: "id,tribe,kind,content,metadata,created_at,updated_at,archived_at",
      id: `eq.${itemId}`,
      limit: "1",
    });

    const response = await this.#fetcher(`${this.#url}/rest/v1/${this.#itemsTable}?${query.toString()}`, {
      headers: this.#headers(),
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Supabase item fetch failed: ${response.status}`);
    }

    const data = (await response.json()) as ReadonlyArray<{
      id: string;
      tribe: string;
      kind: string;
      content: string;
      metadata: JsonObject;
      created_at: string;
      updated_at: string;
      archived_at?: string;
    }>;

    const row = data[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      tribe: row.tribe,
      kind: row.kind,
      content: row.content,
      embedding: [],
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archivedAt: row.archived_at,
    };
  }

  public async getAggregate(itemId: string): Promise<AggregateState | null> {
    const query = new URLSearchParams({
      select: "item_id,attempts,score_sum,score_avg,critic_avg,engagement_avg,last_score,last_critic_score,last_engagement_score,last_outcome_at,updated_at",
      item_id: `eq.${itemId}`,
      limit: "1",
    });

    const response = await this.#fetcher(`${this.#url}/rest/v1/${this.#aggregatesTable}?${query.toString()}`, {
      headers: this.#headers(),
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Supabase aggregate fetch failed: ${response.status}`);
    }

    const data = (await response.json()) as readonly RpcAggregateRow[];
    const row = data[0];
    if (!row) {
      return null;
    }

    return this.#toAggregate(row);
  }

  public async appendOutcome(outcome: OutcomeSignal, critic: CriticResult, finalScore: number): Promise<void> {
    await this.#rpcPost<void>(this.#rpc.recordOutcome, {
      p_item_id: outcome.itemId,
      p_event_id: outcome.id,
      p_platform: outcome.platform,
      p_occurred_at: outcome.occurredAt,
      p_metrics: outcome.metrics,
      p_payload: outcome.payload ?? {},
      p_engagement_score: outcome.engagementScore,
      p_critic_score: critic.score,
      p_final_score: finalScore,
      p_rationale: critic.rationale,
      p_tags: critic.tags,
      p_meta: critic.meta ?? {},
    });
  }

  public async updateAggregate(update: AggregateUpdate, config: AggregationConfig): Promise<AggregateState> {
    const result = await this.#rpcPost<readonly RpcAggregateRow[]>(this.#rpc.applyOutcome, {
      p_item_id: update.itemId,
      p_occurred_at: update.occurredAt,
      p_engagement_score: update.engagementScore,
      p_critic_score: update.criticScore,
      p_final_score: update.finalScore,
      p_decay_factor: config.decayFactor,
    });

    const row = result[0];
    return row ? this.#toAggregate(row) : defaultAggregate(update.itemId, update.occurredAt);
  }

  async #rpcPost<TResponse>(name: string, body: Record<string, unknown>): Promise<TResponse> {
    const response = await this.#fetcher(`${this.#url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: this.#headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Supabase RPC ${name} failed: ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return await response.json() as TResponse;
  }

  #headers(): HeadersInit {
    return {
      "apikey": this.#serviceRoleKey,
      "Authorization": `Bearer ${this.#serviceRoleKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    };
  }

  #toAggregate(row: RpcAggregateRow): AggregateState {
    return {
      itemId: row.item_id,
      attempts: row.attempts,
      scoreSum: row.score_sum,
      scoreAvg: row.score_avg,
      criticAvg: row.critic_avg,
      engagementAvg: row.engagement_avg,
      lastScore: row.last_score,
      lastCriticScore: row.last_critic_score,
      lastEngagementScore: row.last_engagement_score,
      lastOutcomeAt: row.last_outcome_at,
      updatedAt: row.updated_at,
    };
  }
}
