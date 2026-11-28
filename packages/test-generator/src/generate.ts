/**
 * User story -> Playwright spec, using the repo's page objects and fixtures.
 * Loop: generate -> static rules -> typecheck -> run; on failure the error goes back to the model,
 * up to MAX_ATTEMPTS. The model may also decline ("unsupported") when the page objects don't
 * cover the story, which is better than inventing methods or selectors.
 */
import { createProvider, LlmClient, type ChatMessage } from '../../core/src/llm-client';
import { buildContext } from './context';
import { FIXTURE_IMPORT, runSpec, staticCheck, typecheck, writeSpec, type RunResult } from './validate';

export const MAX_ATTEMPTS = Number(process.env.GEN_MAX_ATTEMPTS ?? 3);

export function genClient(): LlmClient {
  const provider = process.env.LLM_PROVIDER ?? 'ollama';
  const model = process.env.GEN_MODEL ?? (provider === 'groq' ? 'openai/gpt-oss-120b' : undefined);
  return new LlmClient(createProvider(provider, model));
}

const SYSTEM = (ctx: ReturnType<typeof buildContext>) => `You write Playwright tests in TypeScript for an existing test suite.

Rules:
1. Start with exactly: import { test, expect } from '${FIXTURE_IMPORT}';
   (add uniqueEmail to that import only if you need a unique email). No other imports.
2. Use the page objects and fixtures below; call their methods instead of writing selectors.
   Only if no page object covers a step may you use page.getByRole/getByLabel/getByText, and say so in "notes".
   Never invent page-object methods or properties: only what is listed exists.
3. Test data: use the customer fixture to log in (never hard-coded credentials) and inStockProduct for
   any product that must be purchasable.
4. Assert the OUTCOME the story promises, specifically. A test that would still pass if the feature
   were broken is worthless (e.g. checking only that a page loaded). Prefer web-first assertions
   (await expect(locator).toHaveText(...)); use expect.poll for values that settle asynchronously.
5. No waitForTimeout, no test.only/skip. One test per story unless the story clearly has two outcomes.
6. If the story cannot be implemented reliably with the available page objects, set "unsupported"
   to the reason and still return your best attempt in "code".
7. When fixing a failing test, fix the TEST. Never weaken an assertion just to make it pass: if the
   app's behaviour contradicts the story, say so in "notes" instead.

PAGE OBJECTS
${ctx.pageObjects}

FIXTURES (destructure them in the test function: async ({ homePage, customer }) => ...)
${ctx.fixtures}

DATA TYPES
${ctx.dataTypes}

STYLE EXAMPLE (a real spec from this repo)
${ctx.styleExample}

Reply with JSON only: {"code": "<the whole spec file>", "notes": "<assumptions, raw locators used, doubts>", "unsupported": "<reason, or empty string>"}`;

const SCHEMA = {
  name: 'generated_spec',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['code', 'notes', 'unsupported'],
    properties: { code: { type: 'string' }, notes: { type: 'string' }, unsupported: { type: 'string' } },
  },
};

export interface Attempt {
  n: number;
  stage: 'static' | 'typecheck' | 'run' | 'passed';
  feedback: string;
}

export interface GenerationResult {
  slug: string;
  file?: string;
  code: string;
  notes: string;
  unsupported: string;
  status: 'passed' | 'failed' | 'unsupported' | 'error';
  attempts: Attempt[];
  rawLocators: number;
  /** Steps done with raw locators: the page objects don't cover them (run 1: the model never said so itself). */
  gaps: string[];
  /** Errors on the very first typecheck, e.g. invented methods. */
  firstTypeErrors: string[];
  lastRun?: RunResult;
  ms: number;
}

export async function generateTest(
  story: string,
  slug: string,
  opts: { bench?: boolean; client?: LlmClient } = {},
): Promise<GenerationResult> {
  const start = Date.now();
  const client = opts.client ?? genClient();
  const ctx = buildContext();
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM(ctx) },
    { role: 'user', content: `USER STORY:\n${story}` },
  ];
  const result: GenerationResult = {
    slug, code: '', notes: '', unsupported: '', status: 'error', attempts: [], rawLocators: 0, gaps: [], firstTypeErrors: [], ms: 0,
  };

  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    let out: { code: string; notes: string; unsupported: string };
    try {
      out = await client.chatJson(messages, { temperature: 0, maxTokens: 3000, schema: SCHEMA, timeoutMs: 120_000 });
    } catch (err) {
      result.notes = `LLM error: ${(err as Error).message.split('\n')[0]}`;
      break;
    }
    const code = String(out.code ?? '').replace(/^```(?:ts|typescript)?\s*|\s*```$/g, '').trim() + '\n';
    Object.assign(result, { code, notes: String(out.notes ?? ''), unsupported: String(out.unsupported ?? '').trim() });
    messages.push({ role: 'assistant', content: JSON.stringify(out) });

    const fail = (stage: Attempt['stage'], feedback: string) => {
      result.attempts.push({ n, stage, feedback });
      messages.push({
        role: 'user',
        content: `The test did not pass ${stage === 'run' ? 'when run against the app' : `the ${stage} check`}:\n${feedback}\n\nReturn the corrected whole file in the same JSON format. Fix the test, never weaken an assertion just to make it pass.`,
      });
    };

    const st = staticCheck(code);
    result.rawLocators = st.rawLocators;
    result.gaps = st.gaps;
    if (st.errors.length) {
      fail('static', st.errors.map((e) => `- ${e}`).join('\n'));
      continue;
    }

    const file = writeSpec(slug, code, { bench: opts.bench });
    result.file = file;
    const typeErrors = typecheck(file);
    if (n === 1) result.firstTypeErrors = typeErrors;
    if (typeErrors.length) {
      fail('typecheck', typeErrors.join('\n'));
      continue;
    }

    const run = runSpec(file);
    result.lastRun = run;
    if (run.status === 'passed') {
      result.attempts.push({ n, stage: 'passed', feedback: '' });
      result.status = result.unsupported ? 'unsupported' : 'passed';
      break;
    }
    if (run.status === 'skipped') {
      // Environment (e.g. bot check), not the model's fault: don't burn attempts on it.
      result.attempts.push({ n, stage: 'run', feedback: 'skipped by the environment guard' });
      result.status = 'error';
      result.notes += ' [run skipped by environment]';
      break;
    }
    fail('run', run.error || run.status);
    result.status = result.unsupported ? 'unsupported' : 'failed';
  }

  result.ms = Date.now() - start;
  return result;
}
