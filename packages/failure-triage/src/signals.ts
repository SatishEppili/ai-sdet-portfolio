/**
 * Cheap, deterministic heuristics. They are given to the LLM as hints and used on their
 * own when no model is available, so the bot degrades gracefully instead of failing CI.
 */
import type { Category, FailureRecord, Signal } from './types';

interface Rule {
  hint: Category;
  weight: number;
  reason: string;
  test: (f: FailureRecord, text: string) => boolean;
}

const RULES: Rule[] = [
  {
    hint: 'flaky', weight: 0.9, reason: 'Failed, then passed on retry with no code change',
    test: (f) => f.outcome === 'flaky',
  },
  {
    hint: 'environment', weight: 0.85, reason: 'Bot-protection / challenge page served instead of the app',
    test: (_f, t) => /performing security verification|cloudflare|captcha|verify you are human/i.test(t),
  },
  {
    hint: 'environment', weight: 0.8, reason: 'Network-level failure (connection refused / DNS / reset)',
    test: (f, t) =>
      /net::ERR_(CONNECTION_REFUSED|NAME_NOT_RESOLVED|CONNECTION_RESET|INTERNET_DISCONNECTED|TIMED_OUT)|ECONNREFUSED|ENOTFOUND|socket hang up/i.test(t) ||
      (f.diagnostics?.failedRequests.some((r) => /ERR_CONNECTION|ERR_NAME|ERR_TIMED_OUT/.test(r.error)) ?? false),
  },
  {
    hint: 'environment', weight: 0.75, reason: 'Gateway / service-unavailable response (502/503/504)',
    test: (f) => f.diagnostics?.httpErrors.some((e) => [502, 503, 504].includes(e.status)) ?? false,
  },
  {
    hint: 'environment', weight: 0.6, reason: 'Shared test account locked or rate-limited (423/429)',
    test: (f, t) => /account locked|too many (failed )?attempts/i.test(t) || (f.diagnostics?.httpErrors.some((e) => [423, 429].includes(e.status)) ?? false),
  },
  {
    hint: 'product-bug', weight: 0.6, reason: 'Server error (500) raised by application code',
    test: (f) => f.diagnostics?.httpErrors.some((e) => e.status === 500 && /exception|error/i.test(e.body ?? '')) ?? false,
  },
  {
    hint: 'product-bug', weight: 0.45, reason: 'API rejected a request with a 4xx validation error',
    test: (f) => f.diagnostics?.httpErrors.some((e) => e.status === 422 || e.status === 400) ?? false,
  },
  {
    hint: 'test-bug', weight: 0.8, reason: 'Strict-mode violation: the locator matches several elements',
    test: (_f, t) => /strict mode violation/i.test(t),
  },
  {
    hint: 'test-bug', weight: 0.7, reason: 'Error thrown from test code itself (TypeError / ReferenceError / SyntaxError)',
    test: (f) => /^(TypeError|ReferenceError|SyntaxError)\b/m.test(f.error.message),
  },
];

export function extractSignals(f: FailureRecord): Signal[] {
  const text = [f.error.message, f.pageSnapshot ?? '', JSON.stringify(f.diagnostics ?? {})].join('\n');
  return RULES.filter((r) => r.test(f, text)).map(({ hint, weight, reason }) => ({ hint, weight, reason }));
}

/** Best guess from signals alone (used as the fallback and as the "no-LLM" benchmark baseline). */
export function heuristicCategory(signals: Signal[]): { category: Category; confidence: number } {
  if (!signals.length) return { category: 'test-bug', confidence: 0.3 };
  const best = [...signals].sort((a, b) => b.weight - a.weight)[0];
  return { category: best.hint, confidence: best.weight };
}
