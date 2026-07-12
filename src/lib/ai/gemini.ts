import { env } from "../env.js";
import { logger } from "../log.js";

/**
 * Minimal Gemini REST transport (generativelanguage.googleapis.com, v1beta).
 * Plain fetch, no SDK: keeps the dependency surface small and lets tests inject a
 * recorded-response `fetchFn`. Endpoint shapes verified against the live API at
 * build time (2026-07).
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Subset of generateContent's response we consume. */
export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateOptions {
  model: string;
  system?: string;
  user: string;
  /** When set, asks for structured output: responseMimeType application/json. */
  responseJsonSchema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
}

export type FetchFn = typeof fetch;

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

async function post(
  url: string,
  body: unknown,
  fetchFn: FetchFn,
  apiKey: string,
): Promise<unknown> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastErr = err as Error; // network error — retryable
      res = undefined as never;
    }
    if (res) {
      if (res.ok) return res.json();
      const text = await res.text().catch(() => "");
      lastErr = new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 500)}`);
      if (!RETRYABLE.has(res.status)) throw lastErr;
    }
    if (attempt < MAX_ATTEMPTS) {
      const delayMs = 1000 * 2 ** (attempt - 1);
      logger.warn({ attempt, delayMs, err: lastErr?.message }, "Gemini call failed, retrying");
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr ?? new Error("Gemini call failed");
}

function requireKey(): string {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set (see .env.example)");
  return key;
}

export async function generateContent(
  opts: GenerateOptions,
  fetchFn: FetchFn = fetch,
): Promise<GenerateResult> {
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: opts.user }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      maxOutputTokens: opts.maxOutputTokens ?? 2048,
      ...(opts.responseJsonSchema
        ? { responseMimeType: "application/json", responseSchema: opts.responseJsonSchema }
        : {}),
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  const json = (await post(
    `${BASE}/models/${opts.model}:generateContent`,
    body,
    fetchFn,
    requireKey(),
  )) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
    };
  };

  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) {
    throw new Error(
      `Gemini returned no text (finishReason=${json.candidates?.[0]?.finishReason ?? "none"})`,
    );
  }
  const usage = json.usageMetadata ?? {};
  return {
    text,
    inputTokens: usage.promptTokenCount ?? 0,
    // Thinking tokens bill as output; include them so cost estimates aren't low.
    outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
  };
}

export interface EmbedResult {
  vectors: number[][];
  /** batchEmbedContents returns no usage metadata; estimated at ~4 chars/token. */
  estInputTokens: number;
}

export async function batchEmbedContents(
  texts: string[],
  opts: { model: string; dim: number; taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" },
  fetchFn: FetchFn = fetch,
): Promise<EmbedResult> {
  if (texts.length === 0) return { vectors: [], estInputTokens: 0 };
  const json = (await post(
    `${BASE}/models/${opts.model}:batchEmbedContents`,
    {
      requests: texts.map((text) => ({
        model: `models/${opts.model}`,
        content: { parts: [{ text }] },
        taskType: opts.taskType,
        outputDimensionality: opts.dim,
      })),
    },
    fetchFn,
    requireKey(),
  )) as { embeddings?: { values?: number[] }[] };

  const vectors = (json.embeddings ?? []).map((e) => e.values ?? []);
  if (vectors.length !== texts.length || vectors.some((v) => v.length !== opts.dim)) {
    throw new Error(
      `Gemini embeddings shape mismatch: got ${vectors.length}/${texts.length} vectors`,
    );
  }
  return {
    vectors,
    estInputTokens: Math.ceil(texts.reduce((n, t) => n + t.length, 0) / 4),
  };
}
