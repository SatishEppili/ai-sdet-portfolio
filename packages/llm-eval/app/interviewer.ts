/**
 * InterviewBot: the AI feature under test. Given an interview question and a candidate's
 * answer it returns a 1-10 score, a verdict and feedback. Exposed over HTTP by server.ts.
 */
import { createProvider, LlmClient } from '../../core/src/llm-client';
import { buildMessages, type PromptVersion, type ScoreRequest } from './prompts';

export interface ScoreResult {
  score: number;
  verdict: 'strong' | 'partial' | 'weak';
  strengths: string[];
  gaps: string[];
  feedback: string;
  model: string;
  version: PromptVersion;
  latencyMs: number;
}

const SCHEMA = {
  name: 'interview_score',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['score', 'verdict', 'strengths', 'gaps', 'feedback'],
    properties: {
      score: { type: 'integer' },
      verdict: { type: 'string', enum: ['strong', 'partial', 'weak'] },
      strengths: { type: 'array', items: { type: 'string' } },
      gaps: { type: 'array', items: { type: 'string' } },
      feedback: { type: 'string' },
    },
  },
};

/** The app's own model (APP_MODEL), separate from the judge's, so the judge isn't grading itself. */
export function appClient(): LlmClient {
  return new LlmClient(createProvider(process.env.LLM_PROVIDER, process.env.APP_MODEL ?? defaultAppModel()));
}

function defaultAppModel(): string | undefined {
  return (process.env.LLM_PROVIDER ?? 'ollama') === 'groq' ? 'openai/gpt-oss-20b' : undefined;
}

export async function scoreAnswer(req: ScoreRequest, version: PromptVersion, client = appClient()): Promise<ScoreResult> {
  const start = Date.now();
  const messages = buildMessages(version, req);
  let raw: Partial<ScoreResult>;
  try {
    raw = await client.chatJson<Partial<ScoreResult>>(messages, { temperature: 0, maxTokens: 400, schema: SCHEMA });
  } catch (err) {
    // Found by the evaluation: ~2% of calls, the model's output fails strict schema validation
    // (HTTP 400). Retry once in plain JSON mode with a little temperature instead of failing.
    if (!/does not match the expected schema|json_validate_failed|did not return valid JSON/i.test((err as Error).message)) throw err;
    raw = await client.chatJson<Partial<ScoreResult>>(messages, { temperature: 0.2, maxTokens: 400 });
  }
  const score = Math.max(1, Math.min(10, Math.round(Number(raw.score))));
  if (!Number.isFinite(score)) throw new Error(`InterviewBot returned no numeric score: ${JSON.stringify(raw).slice(0, 200)}`);
  return {
    score,
    verdict: raw.verdict ?? (score >= 7 ? 'strong' : score >= 4 ? 'partial' : 'weak'),
    strengths: Array.isArray(raw.strengths) ? raw.strengths.map(String) : [],
    gaps: Array.isArray(raw.gaps) ? raw.gaps.map(String) : [],
    feedback: String(raw.feedback ?? ''),
    model: `${client.providerName}/${client.model}`,
    version,
    latencyMs: Date.now() - start,
  };
}
