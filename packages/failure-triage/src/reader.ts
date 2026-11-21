/**
 * Reads Playwright's JSON report (reporter: json) and turns every failed or flaky
 * test into a compact FailureRecord with the evidence an LLM needs.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { CATEGORIES, type Category, type Diagnostics, type FailureRecord } from './types';

const ANSI = /\x1b\[[0-9;]*m/g;
export const stripAnsi = (s = '') => s.replace(ANSI, '');

const SNAPSHOT_MAX = 3000;
const STACK_MAX = 1500;

interface PwAttachment { name: string; contentType: string; path?: string; body?: string }
interface PwResult {
  status: string; duration: number; retry: number; stdout?: { text?: string }[];
  error?: { message?: string; stack?: string; snippet?: string; location?: { file: string; line: number; column: number } };
  attachments: PwAttachment[];
}
interface PwTest { projectName: string; status: string; annotations?: { type: string; description?: string }[]; results: PwResult[] }
interface PwSpec { id: string; title: string; file: string; line: number; tests: PwTest[] }
interface PwSuite { title: string; file?: string; specs?: PwSpec[]; suites?: PwSuite[] }

export function readFailures(resultsFile: string): FailureRecord[] {
  const report = JSON.parse(readFileSync(resultsFile, 'utf8')) as { suites: PwSuite[] };
  const out: FailureRecord[] = [];

  const walk = (suite: PwSuite, path: string[]) => {
    const here = suite.file && suite.title === suite.file ? path : [...path, suite.title];
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        if (test.status !== 'unexpected' && test.status !== 'flaky') continue;
        out.push(toRecord(resultsFile, [...here, spec.title].filter(Boolean).join(' › '), spec, test));
      }
    }
    for (const child of suite.suites ?? []) walk(child, here);
  };
  for (const s of report.suites) walk(s, []);
  return out;
}

function toRecord(resultsFile: string, title: string, spec: PwSpec, test: PwTest): FailureRecord {
  // Use the first failing attempt: for flaky tests that is the interesting one.
  const failed = test.results.find((r) => r.status !== 'passed' && r.status !== 'skipped') ?? test.results[0];
  const err = failed.error ?? {};
  const loc = err.location;
  const expected = test.annotations?.find((a) => a.type === 'expected-category')?.description as Category | undefined;

  return {
    id: spec.id,
    title,
    file: spec.file,
    line: spec.line,
    project: test.projectName,
    outcome: test.status as FailureRecord['outcome'],
    attempts: test.results.length,
    durationMs: Math.round(failed.duration),
    error: {
      message: stripAnsi(err.message).trim(),
      stack: trimStack(stripAnsi(err.stack)),
      snippet: stripAnsi(err.snippet),
      location: loc ? `${relativeish(loc.file)}:${loc.line}` : undefined,
    },
    pageSnapshot: readSnapshot(resultsFile, failed.attachments, title),
    diagnostics: readDiagnostics(resultsFile, failed.attachments),
    stdout: (failed.stdout ?? []).map((s) => s.text ?? '').join('').slice(0, 800) || undefined,
    expected: expected && (CATEGORIES as readonly string[]).includes(expected) ? expected : undefined,
  };
}

/** Attachment paths are absolute on the machine that ran the tests; fall back to next to results.json. */
function resolveAttachment(resultsFile: string, p?: string): string | undefined {
  if (!p) return undefined;
  if (existsSync(p)) return p;
  const local = join(dirname(resultsFile), basename(dirname(p)), basename(p));
  return existsSync(local) ? local : undefined;
}

/** The HTML report keeps a hashed copy of each error-context.md; find ours by test title. */
function findInHtmlReport(resultsFile: string, title: string): string | undefined {
  const dataDir = join(dirname(resultsFile), '..', 'playwright-report', 'data');
  if (!existsSync(dataDir)) return undefined;
  const leaf = title.split(' › ').pop()!;
  for (const f of readdirSync(dataDir).filter((n) => n.endsWith('.md'))) {
    const md = readFileSync(join(dataDir, f), 'utf8');
    const name = md.match(/^- Name: (.*)$/m)?.[1] ?? '';
    if (name.endsWith(`>> ${leaf}`)) return md;
  }
  return undefined;
}

function readSnapshot(resultsFile: string, attachments: PwAttachment[], title: string): string | undefined {
  const a = attachments.find((x) => x.name === 'error-context');
  const file = resolveAttachment(resultsFile, a?.path);
  const md = file ? readFileSync(file, 'utf8') : findInHtmlReport(resultsFile, title);
  if (!md) return undefined;
  // Usually under "# Page snapshot"; some assertion errors embed it as a bare yaml block instead.
  const yaml = (md.match(/# Page snapshot\s+```yaml\n([\s\S]*?)```/) ?? md.match(/```yaml\n([\s\S]*?)```/))?.[1];
  if (!yaml) return undefined;
  const lines = yaml
    .split('\n')
    .filter((l) => !/\/url:|\/placeholder:|^\s*- img\b|option "|^\s*- generic( \[ref=[^\]]+\])?:?$/.test(l))
    .map((l) => l.replace(/ \[ref=[^\]]+\]/g, '').replace(/ \[cursor=pointer\]/g, ''));
  const text = lines.join('\n');
  return text.length > SNAPSHOT_MAX ? `${text.slice(0, SNAPSHOT_MAX)}\n…(truncated)` : text;
}

/**
 * Responses the app produces during normal operation. Leaving them in misleads the model:
 * in the first benchmark run, 4 of 5 misclassifications cited this anonymous-session 401.
 */
export const BENIGN_HTTP: { status: number; path: RegExp; why: string }[] = [
  { status: 401, path: /\/users\/me$/, why: 'session check for a logged-out visitor' },
];

const isBenign = (e: { status: number; url: string }) => {
  const path = (() => { try { return new URL(e.url).pathname; } catch { return e.url; } })();
  return BENIGN_HTTP.some((b) => b.status === e.status && b.path.test(path));
};

function readDiagnostics(resultsFile: string, attachments: PwAttachment[]): Diagnostics | undefined {
  const a = attachments.find((x) => x.name === 'diagnostics');
  if (!a) return undefined;
  try {
    const raw = a.body ? Buffer.from(a.body, 'base64').toString('utf8') : (() => {
      const file = resolveAttachment(resultsFile, a.path);
      return file ? readFileSync(file, 'utf8') : undefined;
    })();
    if (!raw) return undefined;
    const d = JSON.parse(raw) as Diagnostics;
    // The browser and the Angular app both log the benign session-check 401 to the console.
    const consoleNoise = /401 \(Unauthorized\)|status of 401|^ERROR \{message: Unauthorized\}$/;
    return {
      ...d,
      httpErrors: d.httpErrors.filter((e) => !isBenign(e)),
      consoleErrors: d.consoleErrors.filter((c) => !consoleNoise.test(c)),
    };
  } catch {
    return undefined;
  }
}

function trimStack(stack: string): string {
  // Keep the message and frames from our own code; drop node_modules noise.
  const lines = stack.split('\n').filter((l) => !l.includes('node_modules'));
  const s = lines.join('\n');
  return s.length > STACK_MAX ? `${s.slice(0, STACK_MAX)}\n…` : s;
}

function relativeish(file: string): string {
  const i = file.replace(/\\/g, '/').search(/\/(tests|src|packages)\//);
  return i >= 0 ? file.replace(/\\/g, '/').slice(i + 1) : relative(process.cwd(), file);
}
