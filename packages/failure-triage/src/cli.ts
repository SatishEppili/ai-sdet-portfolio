/**
 * npm run triage -- [--results test-results/results.json] [--out triage-report.md] [--base origin/main] [--no-llm]
 *
 * Reads Playwright's JSON report, classifies each failed/flaky test and writes a Markdown
 * report (for the CI job summary / PR comment) plus a JSON file next to it.
 * Always exits 0: triage is advice, it must never be the reason a pipeline fails.
 */
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { LlmClient } from '../../core/src/llm-client';
import { loadChangeContext } from './change-context';
import { FailureClassifier } from './classifier';
import { readFailures } from './reader';
import { toMarkdown } from './report';

const { values } = parseArgs({
  options: {
    results: { type: 'string', default: 'test-results/results.json' },
    out: { type: 'string', default: 'triage-report.md' },
    'no-llm': { type: 'boolean', default: false },
    /** Git ref/sha to diff against (PR base). Defaults to $TRIAGE_BASE; omitted = no change context. */
    base: { type: 'string', default: process.env.TRIAGE_BASE },
  },
});

const resultsFile = values.results!;
if (!existsSync(resultsFile)) {
  console.error(`[triage] ${resultsFile} not found; run the tests first.`);
  process.exit(0);
}

const failures = readFailures(resultsFile);
console.log(`[triage] ${failures.length} failed/flaky test(s) in ${resultsFile}`);

let llm: LlmClient | null = null;
if (!values['no-llm'] && failures.length && process.env.LLM_PROVIDER !== 'none') {
  try {
    llm = new LlmClient();
    await llm.ask('Reply with: ok', undefined, { maxTokens: 5, timeoutMs: 60_000 });
  } catch (err) {
    console.warn(`[triage] LLM unavailable (${(err as Error).message.split('\n')[0]}); using heuristics only.`);
    llm = null;
  }
}

const change = failures.length ? loadChangeContext(values.base) : undefined;
if (change) console.log(`[triage] change context: ${change.files.length} file(s) changed since ${change.base.slice(0, 12)}`);

const classifier = new FailureClassifier(llm);
const results = [];
for (const f of failures) {
  const t = await classifier.classify(f, change);
  console.log(`  ${t.category.padEnd(12)} ${Math.round(t.confidence * 100)}%  ${t.title}`);
  results.push(t);
}

const md = toMarkdown(results, { provider: llm?.providerName ?? 'none', resultsFile, changeBase: change?.base });
writeFileSync(values.out!, md);
writeFileSync(values.out!.replace(/\.md$/, '') + '.json', JSON.stringify(results, null, 2));
console.log(`[triage] wrote ${values.out}`);

// GitHub Actions: expose the count to later steps and show the report on the run page.
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `failures=${results.length}\n`);
if (process.env.GITHUB_STEP_SUMMARY && results.length) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
