/**
 * Provider-agnostic LLM client shared by every project in this repo.
 * Uses plain fetch (Node 18+), no vendor SDKs, so providers are easy to swap.
 */
import 'dotenv/config';

export type Role = 'system' | 'user' | 'assistant';
export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  /** Ask the model to return a JSON object. Parse it with `chatJson`. */
  json?: boolean;
  /**
   * Optional JSON Schema for the answer. Providers that support constrained decoding
   * (Groq gpt-oss: strict json_schema) are then guaranteed to return valid, matching JSON;
   * others fall back to plain JSON mode.
   */
  schema?: { name: string; schema: Record<string, unknown> };
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ChatResult {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
}

// ---------------------------------------------------------------- providers

class OllamaProvider implements LlmProvider {
  readonly name = 'ollama';
  constructor(
    readonly model = process.env.OLLAMA_MODEL ?? 'llama3.2',
    private baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  ) {}

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const body = await postJson(
      `${this.baseUrl}/api/chat`,
      {
        model: this.model,
        messages,
        stream: false,
        ...(opts.json ? { format: 'json' } : {}),
        options: {
          temperature: opts.temperature ?? 0,
          num_predict: opts.maxTokens,
          // Ollama's default window can be small and silently truncates long prompts
          // (system prompt first). Triage prompts with page snapshots need more room.
          num_ctx: Number(process.env.OLLAMA_NUM_CTX ?? 8192),
        },
      },
      {},
      opts.timeoutMs,
    );
    return body.message?.content ?? '';
  }
}

class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  constructor(
    readonly model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    private apiKey = requireEnv('GEMINI_API_KEY'),
  ) {}

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

    const body = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      {
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: {
          temperature: opts.temperature ?? 0,
          maxOutputTokens: opts.maxTokens,
          ...(opts.json ? { responseMimeType: 'application/json' } : {}),
        },
      },
      { 'x-goog-api-key': this.apiKey },
      opts.timeoutMs,
    );
    return body.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  }
}

class GroqProvider implements LlmProvider {
  readonly name = 'groq';
  constructor(
    // llama-3.3-70b-versatile was retired on the free tier (Aug 2026); see console.groq.com/docs/models.
    readonly model = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b',
    private apiKey = requireEnv('GROQ_API_KEY'),
  ) {}

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    // gpt-oss models reason before answering, and reasoning tokens count towards max_tokens:
    // keep reasoning short and leave room for the actual answer.
    const reasoning = this.model.startsWith('openai/gpt-oss');
    const body = await postJson(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: this.model,
        messages,
        temperature: opts.temperature ?? 0,
        max_tokens: reasoning && opts.maxTokens ? Math.max(opts.maxTokens, 4096) : opts.maxTokens,
        ...(reasoning ? { reasoning_effort: 'low' } : {}),
        // json_object mode only validates after generation (and rejects e.g. `0. nine`);
        // strict json_schema constrains decoding so the output is always valid.
        ...(opts.json && opts.schema && reasoning
          ? { response_format: { type: 'json_schema', json_schema: { name: opts.schema.name, strict: true, schema: opts.schema.schema } } }
          : opts.json
            ? { response_format: { type: 'json_object' } }
            : {}),
      },
      { Authorization: `Bearer ${this.apiKey}` },
      opts.timeoutMs,
    );
    return body.choices?.[0]?.message?.content ?? '';
  }
}

// ---------------------------------------------------------------- public API

/** `model` overrides the provider's env default (e.g. a different model for an LLM judge). */
export function createProvider(name = process.env.LLM_PROVIDER ?? 'ollama', model?: string): LlmProvider {
  switch (name.toLowerCase()) {
    case 'ollama':
      return new OllamaProvider(model || undefined);
    case 'gemini':
      return new GeminiProvider(model || undefined);
    case 'groq':
      return new GroqProvider(model || undefined);
    default:
      throw new Error(`Unknown LLM_PROVIDER "${name}". Use ollama | gemini | groq.`);
  }
}

export class LlmClient {
  constructor(private provider: LlmProvider = createProvider()) {}

  get providerName() {
    return this.provider.name;
  }

  get model() {
    return this.provider.model;
  }

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult> {
    const start = Date.now();
    const text = await withRetry(() => this.provider.chat(messages, opts));
    return { text, provider: this.provider.name, model: this.provider.model, latencyMs: Date.now() - start };
  }

  /** Simple single-turn helper. */
  async ask(prompt: string, system?: string, opts?: ChatOptions): Promise<string> {
    const messages: ChatMessage[] = system
      ? [{ role: 'system', content: system }, { role: 'user', content: prompt }]
      : [{ role: 'user', content: prompt }];
    return (await this.chat(messages, opts)).text;
  }

  /** Ask for JSON and parse it. Tolerates ```json fences that some models add. */
  async chatJson<T = unknown>(messages: ChatMessage[], opts: ChatOptions = {}): Promise<T> {
    const { text } = await this.chat(messages, { ...opts, json: true });
    return parseJsonLoose<T>(text);
  }
}

// ---------------------------------------------------------------- helpers

export function parseJsonLoose<T>(text: string): T {
  const cleaned = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/[{[][\s\S]*[}\]]/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error(`LLM did not return valid JSON:\n${text.slice(0, 500)}`);
  }
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var ${key}. Add it to your .env file (see .env.example).`);
  return v;
}

class HttpError extends Error {
  constructor(public status: number, message: string, public retryAfterMs?: number) {
    super(message);
  }
}

async function postJson(url: string, payload: unknown, headers: Record<string, string>, timeoutMs = 120_000) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text();
    const header = Number(res.headers.get('retry-after'));
    // Groq also says it in the body: "Please try again in 1.2525s" / "in 850ms".
    const hint = text.match(/try again in ([\d.]+)\s*(ms|s)\b/i);
    const retryAfterMs =
      Number.isFinite(header) && header > 0 ? header * 1000 : hint ? Number(hint[1]) * (hint[2].toLowerCase() === 'ms' ? 1 : 1000) : undefined;
    throw new HttpError(res.status, `LLM HTTP ${res.status} from ${new URL(url).host}: ${text.slice(0, 300)}`, retryAfterMs);
  }
  return res.json() as Promise<any>;
}

/**
 * Retries rate limits (429) and 5xx. 429s get more patience (free tiers have per-minute token
 * limits) and honour the server's hint; a little jitter stops parallel callers retrying in lockstep.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 5, rateLimitAttempts = 10): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const http = err instanceof HttpError ? err : undefined;
      // A daily quota won't recover in seconds: fail fast instead of crawling for minutes.
      if (http?.status === 429 && /per day|TPD|RPD/i.test(http.message)) {
        throw new Error(`Daily LLM quota exhausted; try later, use another model/provider, or upgrade. ${http.message}`);
      }
      // Network drops ("fetch failed", resets) are as transient as a 503: the v3 eval run lost 3
      // calls to them. Timeouts (AbortError/TimeoutError) are not retried: the caller set that budget.
      const networkDrop = !http && err instanceof TypeError && /fetch failed|ECONNRESET|socket|network/i.test(`${err.message} ${(err as { cause?: unknown }).cause ?? ''}`);
      const retryable = http ? http.status === 429 || http.status >= 500 : networkDrop;
      if (!retryable || i >= (http?.status === 429 ? rateLimitAttempts : attempts)) throw err;
      const backoff = Math.min(16_000, 1000 * 2 ** (i - 1));
      const wait = Math.min(30_000, (http?.retryAfterMs ?? backoff) * 1.1) + Math.random() * 500;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
