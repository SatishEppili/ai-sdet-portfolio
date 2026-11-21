export const CATEGORIES = ['product-bug', 'flaky', 'environment', 'test-bug'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Diagnostics {
  url?: string;
  consoleErrors: string[];
  failedRequests: { method: string; url: string; error: string }[];
  httpErrors: { method: string; url: string; status: number; body?: string }[];
}

/** One failed (or flaky) test, normalised from Playwright's JSON report. */
export interface FailureRecord {
  id: string;
  title: string; // "Suite › test name"
  file: string;
  line: number;
  project: string;
  /** "unexpected" = failed every attempt, "flaky" = failed then passed on retry. */
  outcome: 'unexpected' | 'flaky';
  attempts: number;
  durationMs: number;
  error: {
    message: string;
    stack: string;
    snippet: string;
    location?: string;
  };
  /** Accessibility snapshot of the page at failure time (from error-context.md), trimmed. */
  pageSnapshot?: string;
  diagnostics?: Diagnostics;
  stdout?: string;
  /** Ground truth for benchmark cases (annotation "expected-category"). */
  expected?: Category;
}

export interface Signal {
  hint: Category;
  reason: string;
  /** 0..1, how strongly this heuristic points at `hint`. */
  weight: number;
}

export interface Triage {
  id: string;
  title: string;
  location: string;
  category: Category;
  confidence: number;
  summary: string;
  rootCause: string;
  suggestedFix: string;
  evidence: string[];
  signals: Signal[];
  /** "llm" when the model answered, "heuristic" when we fell back to signals only. */
  source: 'llm' | 'heuristic';
  model?: string;
  latencyMs?: number;
  expected?: Category;
}
