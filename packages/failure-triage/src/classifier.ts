import { LlmClient, type ChatMessage } from '../../core/src/llm-client';
import { extractSignals, heuristicCategory } from './signals';
import { CATEGORIES, type Category, type FailureRecord, type Triage } from './types';

const SYSTEM = `You are a senior SDET triaging failed end-to-end tests (Playwright, TypeScript).
Classify each failure into exactly one category:

- "product-bug": the application under test behaves incorrectly. The test is right and the
  environment is healthy, but the app returns wrong data, wrong ordering, wrong prices, rejects
  valid input, or throws an application exception (e.g. 500 with a stack trace from app code).
- "environment": infrastructure or test-environment problems outside both the app logic and the
  test code: connection refused, DNS failure, 502/503/504, bot protection / challenge pages,
  locked or rate-limited shared test accounts, services not started, slow/unreachable hosts.
- "test-bug": the test itself is wrong: typo or stale locator, a locator that matches several
  elements (strict mode), wrong expected value, wrong hard-coded test data, missing waits / race
  conditions in the test, errors thrown from test code.
- "flaky": the same test fails intermittently and passes on retry without any change.
  If the record says outcome "flaky" (failed, then passed on retry), prefer "flaky".

Weigh the evidence: error message, code snippet, page snapshot (what the user saw), and
diagnostics (failed requests, HTTP errors with bodies, console errors). Heuristic signals are
hints, not answers. A locator timing out is a test-bug only if the page loaded normally; if the
page shows an error, a challenge page or no data because requests failed, look at why.

Reply with ONLY a JSON object:
{"category": "product-bug|environment|test-bug|flaky",
 "confidence": 0.0-1.0,
 "summary": "one line, max 15 words",
 "rootCause": "1-2 sentences: the most likely cause, citing evidence",
 "suggestedFix": "1-2 concrete sentences: what to change and where",
 "evidence": ["short quotes or facts from the record that support the verdict"]}`;

function describe(f: FailureRecord, signals: ReturnType<typeof extractSignals>): string {
  const d = f.diagnostics;
  return [
    `TEST: ${f.title}`,
    `FILE: ${f.error.location ?? `${f.file}:${f.line}`}`,
    `OUTCOME: ${f.outcome} after ${f.attempts} attempt(s); failing attempt took ${f.durationMs} ms`,
    `ERROR:\n${f.error.message.slice(0, 1500)}`,
    f.error.snippet && `CODE:\n${f.error.snippet}`,
    d && `PAGE URL AT FAILURE: ${d.url}`,
    d?.failedRequests.length && `FAILED REQUESTS:\n${d.failedRequests.map((r) => `- ${r.method} ${r.url} -> ${r.error}`).join('\n')}`,
    d?.httpErrors.length && `HTTP ERRORS:\n${d.httpErrors.map((e) => `- ${e.method} ${e.url} -> ${e.status} ${e.body ?? ''}`).join('\n')}`,
    d?.consoleErrors.length && `CONSOLE ERRORS:\n${d.consoleErrors.slice(0, 8).map((c) => `- ${c}`).join('\n')}`,
    f.pageSnapshot && `PAGE SNAPSHOT (accessibility tree at failure):\n${f.pageSnapshot}`,
    `HEURISTIC SIGNALS: ${signals.length ? signals.map((s) => `${s.hint} (${s.weight}) - ${s.reason}`).join('; ') : 'none'}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

interface LlmVerdict {
  category: string; confidence: number; summary: string; rootCause: string; suggestedFix: string; evidence: string[];
}

function isValid(v: Partial<LlmVerdict> | null | undefined): v is LlmVerdict {
  return !!v && (CATEGORIES as readonly string[]).includes(String(v.category)) && typeof v.rootCause === 'string';
}

export class FailureClassifier {
  constructor(private llm: LlmClient | null = new LlmClient()) {}

  async classify(f: FailureRecord): Promise<Triage> {
    const signals = extractSignals(f);
    const base = {
      id: f.id, title: f.title, location: f.error.location ?? `${f.file}:${f.line}`, signals, expected: f.expected,
    };

    if (this.llm) {
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: describe(f, signals) },
      ];
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const start = Date.now();
          const v = await this.llm.chatJson<LlmVerdict>(messages, { temperature: 0, maxTokens: 600 });
          if (!isValid(v)) throw new Error(`invalid verdict: ${JSON.stringify(v).slice(0, 200)}`);
          return {
            ...base,
            category: v.category as Category,
            confidence: clamp(Number(v.confidence) || 0.5),
            summary: v.summary ?? '',
            rootCause: v.rootCause,
            suggestedFix: v.suggestedFix ?? '',
            evidence: Array.isArray(v.evidence) ? v.evidence.slice(0, 5).map(String) : [],
            source: 'llm',
            model: this.llm.providerName,
            latencyMs: Date.now() - start,
          };
        } catch (err) {
          if (attempt === 2) console.warn(`[triage] LLM failed for "${f.title}": ${(err as Error).message}`);
        }
      }
    }

    const h = heuristicCategory(signals);
    return {
      ...base,
      ...h,
      summary: signals[0]?.reason ?? 'No strong signal; needs a human look',
      rootCause: signals.length ? signals.map((s) => s.reason).join('; ') : f.error.message.split('\n')[0],
      suggestedFix: '',
      evidence: [f.error.message.split('\n')[0]],
      source: 'heuristic',
    };
  }
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
