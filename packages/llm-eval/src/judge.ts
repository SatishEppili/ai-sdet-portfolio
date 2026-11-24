/**
 * LLM-as-judge for the bot's FEEDBACK (scores are checked against ground truth; feedback has
 * no single right answer, so it is graded against a rubric instead). The judge uses its own
 * model (JUDGE_MODEL) so the app is not grading itself where the provider allows it.
 */
import { createProvider, LlmClient } from '../../core/src/llm-client';

export interface JudgeScores {
  specificity: number;
  accuracy: number;
  actionability: number;
  tone: number;
  rationale: string;
}

export function judgeClient(): LlmClient {
  const provider = process.env.LLM_PROVIDER ?? 'ollama';
  const model = process.env.JUDGE_MODEL ?? (provider === 'groq' ? 'openai/gpt-oss-120b' : undefined);
  return new LlmClient(createProvider(provider, model));
}

const SYSTEM = `You grade feedback that an AI interviewer gave on a candidate's answer.
Rate each criterion 1-5:
- specificity: refers to what THIS answer actually said, not generic advice (1 = generic).
- accuracy: consistent with the key points of a correct answer; praises only correct content and
  names real gaps (1 = praises wrong statements or invents gaps).
- actionability: tells the candidate what to add or fix (1 = nothing usable).
- tone: professional and respectful (1 = rude or condescending).
Reply with JSON only: {"specificity": n, "accuracy": n, "actionability": n, "tone": n, "rationale": "one sentence"}`;

const SCHEMA = {
  name: 'feedback_grade',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['specificity', 'accuracy', 'actionability', 'tone', 'rationale'],
    properties: {
      specificity: { type: 'integer' },
      accuracy: { type: 'integer' },
      actionability: { type: 'integer' },
      tone: { type: 'integer' },
      rationale: { type: 'string' },
    },
  },
};

export async function judgeFeedback(
  client: LlmClient,
  input: { question: string; keyPoints: string[]; answer: string; score: number; feedback: string },
): Promise<JudgeScores> {
  const user = [
    `QUESTION: ${input.question}`,
    `KEY POINTS OF A CORRECT ANSWER: ${input.keyPoints.join('; ')}`,
    `CANDIDATE ANSWER: ${input.answer || '(empty)'}`,
    `INTERVIEWER SCORE: ${input.score}/10`,
    `INTERVIEWER FEEDBACK: ${input.feedback}`,
  ].join('\n');
  const v = await client.chatJson<JudgeScores>(
    [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
    { temperature: 0, maxTokens: 300, schema: SCHEMA },
  );
  const clamp = (n: unknown) => Math.max(1, Math.min(5, Math.round(Number(n)) || 1));
  return {
    specificity: clamp(v.specificity),
    accuracy: clamp(v.accuracy),
    actionability: clamp(v.actionability),
    tone: clamp(v.tone),
    rationale: String(v.rationale ?? ''),
  };
}
