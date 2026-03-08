/**
 * LLM-as-Judge Critic
 *
 * Uses an LLM (Claude, GPT, etc.) to score item quality
 * against the outcome signal with structured reasoning.
 *
 * This replaces the heuristic keyword matching with genuine
 * semantic understanding of why content performed.
 */
import type { Critic, CriticInput, CriticResult, JsonObject } from "../../src/types.ts";
import { clamp } from "../../src/utils.ts";

export interface LlmCriticOptions {
  readonly provider: "anthropic" | "openai";
  readonly model?: string;
  readonly apiKey: string;
  readonly systemPrompt?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
}

interface LlmJudgement {
  readonly score: number;
  readonly rationale: string;
  readonly tags: string[];
}

export class LlmCritic implements Critic {
  readonly #provider: string;
  readonly #model: string;
  readonly #apiKey: string;
  readonly #systemPrompt: string;
  readonly #maxTokens: number;
  readonly #temperature: number;

  public constructor(options: LlmCriticOptions) {
    this.#provider = options.provider;
    this.#model = options.model ?? (options.provider === "anthropic" ? "claude-sonnet-4-5-20250514" : "gpt-4o-mini");
    this.#apiKey = options.apiKey;
    this.#maxTokens = options.maxTokens ?? 512;
    this.#temperature = options.temperature ?? 0.2;
    this.#systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  }

  public async score(input: CriticInput): Promise<CriticResult> {
    const userPrompt = buildUserPrompt(input);

    const judgement = this.#provider === "anthropic"
      ? await this.#callAnthropic(userPrompt)
      : await this.#callOpenAI(userPrompt);

    const engagementBoost = input.outcome.engagementScore * 0.4;
    const llmScore = clamp(judgement.score, 0, 1);
    const combined = clamp(llmScore * 0.6 + engagementBoost, 0, 1);

    return {
      score: combined,
      rationale: judgement.rationale,
      tags: judgement.tags,
      meta: {
        llmRawScore: judgement.score,
        provider: this.#provider,
        model: this.#model,
      },
    };
  }

  async #callAnthropic(userPrompt: string): Promise<LlmJudgement> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.#apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.#model,
        max_tokens: this.#maxTokens,
        temperature: this.#temperature,
        system: this.#systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json() as { content: { text: string }[] };
    return parseJudgement(data.content[0]?.text ?? "{}");
  }

  async #callOpenAI(userPrompt: string): Promise<LlmJudgement> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.#model,
        max_tokens: this.#maxTokens,
        temperature: this.#temperature,
        messages: [
          { role: "system", content: this.#systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    return parseJudgement(data.choices[0]?.message?.content ?? "{}");
  }
}

const DEFAULT_SYSTEM_PROMPT = `You are a content quality critic for a self-improving retrieval system.

Given a content item and its real-world performance metrics, produce a JSON judgement:

{
  "score": <number 0-1>,
  "rationale": "<one sentence explaining the score>",
  "tags": ["<relevant tags>"]
}

Score dimensions:
- Clarity and specificity (vague = low, concrete = high)
- Novelty (rehashed advice = low, genuine insight = high)
- Engagement alignment (high metrics + quality content = high, high metrics + clickbait = moderate)
- Sustainability (will this keep working or burn out the audience?)

Respond with ONLY the JSON object.`;

function buildUserPrompt(input: CriticInput): string {
  return `Content: "${input.item.content}"
Platform: ${input.outcome.platform}
Metrics: ${JSON.stringify(input.outcome.metrics)}
Engagement score: ${input.outcome.engagementScore.toFixed(3)}
Previous attempts: ${input.aggregateBefore.attempts}
Previous avg score: ${input.aggregateBefore.scoreAvg.toFixed(3)}`;
}

function parseJudgement(raw: string): LlmJudgement {
  try {
    const parsed = JSON.parse(raw) as LlmJudgement;
    return {
      score: clamp(Number(parsed.score) || 0.5, 0, 1),
      rationale: String(parsed.rationale || "No rationale provided."),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    };
  } catch {
    return { score: 0.5, rationale: "Failed to parse LLM response.", tags: ["parse-error"] };
  }
}
