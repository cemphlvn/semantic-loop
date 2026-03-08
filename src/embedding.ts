import type { EmbeddingProvider, EmbeddingVector } from "./types.ts";

export class NoopEmbedding implements EmbeddingProvider {
  readonly dimensions = 0;

  public async embed(_text: string): Promise<EmbeddingVector> {
    return [];
  }
}

export interface OpenAIEmbeddingOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly dimensions?: number;
  readonly baseUrl?: string;
}

export class OpenAIEmbedding implements EmbeddingProvider {
  readonly dimensions: number;
  readonly #apiKey: string;
  readonly #model: string;
  readonly #baseUrl: string;

  public constructor(options: OpenAIEmbeddingOptions) {
    this.#apiKey = options.apiKey;
    this.#model = options.model ?? "text-embedding-3-small";
    this.dimensions = options.dimensions ?? 1536;
    this.#baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  }

  public async embed(text: string): Promise<EmbeddingVector> {
    const response = await fetch(`${this.#baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.#model,
        input: text,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding failed: ${response.status}`);
    }

    const data = await response.json() as { data: { embedding: number[] }[] };
    return data.data[0]?.embedding ?? [];
  }

  public async embedBatch(texts: readonly string[]): Promise<readonly EmbeddingVector[]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.#baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.#model,
        input: texts,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding batch failed: ${response.status}`);
    }

    const data = await response.json() as {
      data: { embedding: number[]; index: number }[];
    };
    return data.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}
