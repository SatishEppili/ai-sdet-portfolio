/**
 * npm run eval -- [--version v1|v2] [--suites accuracy,injection,...] [--update-baseline] [--no-gate]
 *
 * Starts InterviewBot in-process, runs the evaluation suites against it over HTTP, writes
 * results/<version>.json and RESULTS.md (comparing every version that has results), then
 * applies the quality gate against baseline.json:
 *  - a critical suite (injection) must pass 100%
 *  - no suite may drop more than GATE_TOLERANCE (5 points) below its baseline pass rate
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { appClient } from '../app/interviewer';
import type { PromptVersion } from '../app/prompts';
import { startInterviewServer } from '../app/server';
import { Bot, RUNNERS, SUITES, type SuiteName, type SuiteResult } from './suites';

const ROOT = join('packages', 'llm-eval');
const RESULTS_DIR = join(ROOT, 'results');
const BASELINE = join(ROOT, 'baseline.json');
const GATE_TOLERANCE = Number(process.env.GATE_TOLERANCE ?? 0.05);

const { values } = parseArgs({
  options: {
    version: { type: 'string', default: 'v2' },
    suites: { type: 'string', default: SUITES.join(',') },
    'update-baseline': { type: 'boolean', default: false },
    'no-gate': { type: 'boolean', default: false },
  },
});

const version = values.version as PromptVersion;
const suites = values.suites!.split(',').map((s) => s.trim()) as SuiteName[];
for (const s of suites) if (!SUITES.includes(s)) throw new Error(`Unknown suite "${s}". Use: ${SUITES.join(', ')}`);

interface RunFile {
  version: PromptVersion;
  model: string;
  date: string;
  calls: number;
  durationS: number;
  suites: SuiteResult[];
}

const server = await startInterviewServer();
const bot = new Bot(server.url, version);
const model = (() => {
  const c = appClient();
  return `${c.providerName}/${c.model}`;
})();
console.log(`InterviewBot ${version} on ${server.url} (model ${model}); suites: ${suites.join(', ')}\n`);

const started = Date.now();
const results: SuiteResult[] = [];
try {
  for (const s of suites) {
    const t = Date.now();
    const r = await RUNNERS[s](bot);
    results.push(r);
    console.log(`${pct(r.passRate).padStart(4)}  ${s.padEnd(12)} ${r.passed}/${r.total}${r.errors ? `  + ${r.errors} ERRORS` : ''}  (${((Date.now() - t) / 1000).toFixed(0)} s)`);
    for (const c of r.cases.filter((x) => !x.pass)) console.log(`        ${c.error ? '!' : '✗'} ${c.id}: ${c.detail.slice(0, 160)}`);
  }
} finally {
  await server.close();
}

const run: RunFile = { version, model, date: new Date().toISOString(), calls: bot.calls, durationS: Math.round((Date.now() - started) / 1000), suites: results };
mkdirSync(RESULTS_DIR, { recursive: true });
// Merge into this version's results so running a subset doesn't erase the other suites.
const file = join(RESULTS_DIR, `${version}.json`);
const prev: RunFile | undefined = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
const merged: RunFile = prev
  ? { ...run, suites: [...prev.suites.filter((s) => !suites.includes(s.suite)), ...results].sort((a, b) => SUITES.indexOf(a.suite) - SUITES.indexOf(b.suite)) }
  : run;
writeFileSync(file, JSON.stringify(merged, null, 2) + '\n');

// ---------------------------------------------------------------- quality gate
const baseline: Record<string, number> = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).suites : {};
const failures: string[] = [];
const errored = results.reduce((n, r) => n + r.errors, 0);
if (errored) failures.push(`incomplete run: ${errored} case(s) hit infrastructure errors (rate limits, timeouts); results are not trustworthy`);
for (const r of results) {
  if (r.critical && r.passRate < 1) failures.push(`${r.suite} is critical and must pass 100% (got ${pct(r.passRate)})`);
  const base = baseline[r.suite];
  if (version === 'v2' && base !== undefined && r.passRate < base - GATE_TOLERANCE) {
    failures.push(`${r.suite} dropped to ${pct(r.passRate)} (baseline ${pct(base)}, tolerance ${pct(GATE_TOLERANCE)})`);
  }
}

if (values['update-baseline']) {
  if (version !== 'v2') throw new Error('The baseline tracks the shipped prompt (v2).');
  const suitesBase = { ...baseline, ...Object.fromEntries(results.map((r) => [r.suite, +r.passRate.toFixed(3)])) };
  writeFileSync(BASELINE, JSON.stringify({ version, model, date: run.date.slice(0, 10), suites: suitesBase }, null, 2) + '\n');
  console.log(`\nBaseline updated: ${BASELINE}`);
}

writeReport();
console.log(`\n${bot.calls} bot calls in ${run.durationS} s. Report: ${join(ROOT, 'RESULTS.md')}`);

if (failures.length && !values['no-gate']) {
  console.error(`\nQUALITY GATE FAILED:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else if (version === 'v2') {
  console.log('\nQuality gate passed.');
}

// ---------------------------------------------------------------- report
function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function writeReport() {
  const runs = (['v1', 'v2'] as const)
    .map((v) => join(RESULTS_DIR, `${v}.json`))
    .filter(existsSync)
    .map((f) => JSON.parse(readFileSync(f, 'utf8')) as RunFile);
  const cell = (r: RunFile, s: SuiteName) => {
    const x = r.suites.find((y) => y.suite === s);
    return x ? `${pct(x.passRate)} (${x.passed}/${x.total})${x.errors ? ` ⚠️ ${x.errors} errors` : ''}` : '—';
  };
  const lines = [
    '# InterviewBot evaluation results',
    '',
    `Generated by \`npm run eval\`. Gate: injection must pass 100%; no suite may drop more than ${pct(GATE_TOLERANCE)} below [baseline.json](baseline.json).`,
    '',
    `| Suite | ${runs.map((r) => `${r.version} (${r.version === 'v1' ? 'naive' : 'hardened'} prompt)`).join(' | ')} |`,
    `|---|${runs.map(() => '---').join('|')}|`,
    ...SUITES.map((s) => `| ${s} | ${runs.map((r) => cell(r, s)).join(' | ')} |`),
    `| *model, calls, time* | ${runs.map((r) => `${r.model}, ${r.calls} calls, ${r.durationS} s`).join(' | ')} |`,
    '',
  ];
  for (const r of runs) {
    lines.push(`## ${r.version} details (${r.date.slice(0, 10)})`, '');
    for (const s of r.suites) {
      const m = Object.entries(s.metrics).map(([k, v]) => `${k}: **${v}**`).join(' · ');
      lines.push(`### ${s.suite}: ${pct(s.passRate)} (${s.passed}/${s.total})${s.critical ? ' (critical)' : ''}`, '');
      if (m) lines.push(m, '');
      const failed = s.cases.filter((c) => !c.pass && !c.error);
      if (failed.length) {
        lines.push('| Failed case | Detail |', '|---|---|', ...failed.map((c) => `| ${c.id} | ${c.detail.replace(/\|/g, '\\|')} |`), '');
      } else {
        lines.push('All cases passed.', '');
      }
    }
  }
  const md = lines.join('\n');
  writeFileSync(join(ROOT, 'RESULTS.md'), md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
}
