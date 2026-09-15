import type { ZodType, ZodTypeDef } from "zod";

/**
 * AI provider abstraction.
 *
 * Every AI call declares a Zod schema and a deterministic fallback. If no model
 * is configured, or the model returns something that fails validation, the
 * fallback runs instead. The app therefore always produces coaching, and that
 * coaching is always the shape the UI expects.
 *
 * The fallback is NOT a fake: it is computed from the same real signals that
 * are sent to the model. It just reasons with rules instead of a language model.
 */

export type AISource = "ai" | "rules";

export type AIResult<T> = {
  data: T;
  source: AISource;
  model: string | null;
  /** Set when the model was tried and we fell back, so the UI can be honest. */
  note?: string;
};

export type GenerateRequest<T> = {
  /** Short identifier used in logs. */
  name: string;
  system: string;
  prompt: string;
  // Input is left unconstrained so schemas using .default() still infer T
  // from their OUTPUT type rather than their (optional) input type.
  schema: ZodType<T, ZodTypeDef, unknown>;
  fallback: () => T;
  maxTokens?: number;
};

export interface AIProvider {
  readonly id: string;
  readonly model: string | null;
  generate<T>(request: GenerateRequest<T>): Promise<AIResult<T>>;
}

export const COACH_SYSTEM_PROMPT = `You are a golf coach reasoning over a single player's real performance data.

Rules you must follow:
- Every number you state must come from the data you were given. Never invent a statistic, a shot, a drill, or a trend.
- Distinguish clearly between observed, likely, possible and uncertain. Use phrases like "likely contributing to", "consistent with", "may explain", "possible relationship" rather than asserting causation.
- Respect sample size. If a segment is marked as an insufficient sample, call it an early signal and say more data is needed. Never call it a confirmed weakness.
- Speak like a coach talking to a player: direct, specific, honest, encouraging without fluff. Not "statistically suboptimal outcome" but "you're giving away shots from 150 to 175".
- Prioritise. Name one primary development area, at most two secondary ones. Never produce a list of fifteen faults.
- Reply with JSON only. No markdown fences, no commentary before or after.`;

/** Deterministic provider. Used when no API key is configured. */
export class RulesProvider implements AIProvider {
  readonly id = "rules";
  readonly model = null;

  async generate<T>(request: GenerateRequest<T>): Promise<AIResult<T>> {
    return { data: request.fallback(), source: "rules", model: null };
  }
}

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    model = process.env.AI_MODEL || "claude-sonnet-5",
  ) {
    this.model = model;
  }

  async generate<T>(request: GenerateRequest<T>): Promise<AIResult<T>> {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: this.apiKey });

      const message = await client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 2000,
        system: request.system,
        messages: [
          { role: "user", content: request.prompt },
          // Prefilling the opening brace keeps the reply to raw JSON without
          // needing a JSON-schema round trip.
          { role: "assistant", content: "{" },
        ],
      });

      const text = message.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
      const parsed = request.schema.safeParse(parseJson(`{${text}`));
      if (parsed.success) {
        return { data: parsed.data, source: "ai", model: this.model };
      }
      return {
        data: request.fallback(),
        source: "rules",
        model: this.model,
        note: `Model output failed validation for ${request.name}; showing the rule-based coach instead.`,
      };
    } catch (error) {
      return {
        data: request.fallback(),
        source: "rules",
        model: this.model,
        note:
          error instanceof Error
            ? `AI call failed (${error.message}); showing the rule-based coach instead.`
            : "AI call failed; showing the rule-based coach instead.",
      };
    }
  }
}

/** Tolerates a stray fence or trailing prose without a parsing library. */
function parseJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

let cached: AIProvider | null = null;

export function getProvider(): AIProvider {
  if (cached) return cached;
  const key = process.env.ANTHROPIC_API_KEY;
  cached = key ? new AnthropicProvider(key) : new RulesProvider();
  return cached;
}

/** Test seam. */
export function setProvider(provider: AIProvider | null): void {
  cached = provider;
}
