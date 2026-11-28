/**
 * Checks a generated spec three ways, cheapest first:
 *  1. static rules (imports, page objects, assertions, no sleeps, no hard-coded credentials)
 *  2. typecheck (catches invented page-object methods and wrong argument shapes)
 *  3. run it with Playwright, optionally against a mutant (a deliberately broken app)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const PKG = join('packages', 'test-generator');
export const OUT_DIR = join(PKG, 'out');
export const CONFIG = join(PKG, 'playwright.config.ts');
/** Generated specs import from here (the same fixtures the hand-written suite uses). */
export const FIXTURE_IMPORT = '../../../src/fixtures/test';
/** Benchmark runs swap in this module: same API plus an auto fixture that can apply a mutant. */
export const BENCH_FIXTURE_IMPORT = '../bench/fixtures';

export interface StaticReport {
  errors: string[]; // must fix
  rawLocators: number; // page.getBy*/locator calls instead of page objects (allowed, but counted)
  /** The raw locator calls themselves: page-object gaps, detected by the tool rather than self-reported. */
  gaps: string[];
}

export function staticCheck(code: string): StaticReport {
  const errors: string[] = [];
  const imports = [...code.matchAll(/^import .* from ['"]([^'"]+)['"];?$/gm)].map((m) => m[1]);
  const bad = imports.filter((i) => i !== FIXTURE_IMPORT);
  if (!imports.includes(FIXTURE_IMPORT)) errors.push(`Import test and expect from '${FIXTURE_IMPORT}'.`);
  if (bad.length) errors.push(`Only import from '${FIXTURE_IMPORT}' (found: ${bad.join(', ')}).`);
  if (!/\bexpect(\.(poll|soft))?\s*\(/.test(code)) errors.push('The test has no expect(): it would pass without checking anything.');
  if (/waitForTimeout\s*\(/.test(code)) errors.push('Do not use waitForTimeout (fixed sleeps); rely on auto-waiting and web-first assertions.');
  if (/\btest\.(only|skip|fixme)\s*\(/.test(code)) errors.push('Do not use test.only / test.skip / test.fixme.');
  if (/customer@practicesoftwaretesting\.com|welcome01/i.test(code)) errors.push('Do not hard-code the shared demo account; use the customer fixture.');
  if (/page\.\$\$?\(|xpath=|\/\/(?:div|span|button|a|input)\[/.test(code)) errors.push('No CSS/XPath selectors via page.$ or XPath; use page objects.');
  if (!/\btest\s*\(\s*['"`]/.test(code)) errors.push('Define at least one test(...).');
  const gaps = [...code.matchAll(/\bpage\.(?:locator|getBy\w+)\s*\([^)]*\)/g)].map((m) => m[0]);
  return { errors, rawLocators: gaps.length, gaps };
}

export function writeSpec(slug: string, code: string, opts: { bench?: boolean } = {}): string {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${slug}.spec.ts`);
  writeFileSync(file, opts.bench ? code.split(FIXTURE_IMPORT).join(BENCH_FIXTURE_IMPORT) : code);
  return file;
}

/** Typecheck generated code and keep only errors in this file (others aren't the model's fault). */
export function typecheck(file: string): string[] {
  // Generated code is checked with its own tsconfig, so a broken leftover never breaks `npm run typecheck`.
  const res = spawnSync('npx', ['tsc', '--noEmit', '-p', join(PKG, 'tsconfig.gen.json')], { encoding: 'utf8', shell: true });
  const needle = relative('.', file).replace(/\\/g, '/');
  return `${res.stdout}\n${res.stderr}`
    .split('\n')
    .map((l) => l.trim().replace(/\\/g, '/'))
    .filter((l) => l.includes(needle) && /error TS\d+/.test(l))
    .slice(0, 15);
}

export interface RunResult {
  status: 'passed' | 'failed' | 'skipped' | 'error';
  error: string; // first lines of the failure, for the fix loop and the report
  durationMs: number;
}

const ANSI = /\x1b\[[0-9;]*m/g;

/**
 * Validation messages and invalid fields from the page snapshot Playwright saves on failure.
 * In run 1, S09's form never submitted ("Only numbers are allowed." under a +43 phone number),
 * so there was no network error to report, only this.
 */
function describePageMessages(attachments: { name: string; path?: string }[]): string {
  const a = attachments.find((x) => x.name === 'error-context' && x.path && existsSync(x.path));
  if (!a) return '';
  // Usually under "# Page snapshot"; some failures embed it as a bare yaml block (same as Project 2's reader).
  const md = readFileSync(a.path!, 'utf8');
  const yaml = (md.match(/# Page snapshot\s+```yaml\n([\s\S]*?)```/) ?? md.match(/```yaml\n([\s\S]*?)```/))?.[1] ?? '';
  const lines = yaml.split('\n');
  const found: string[] = [];
  lines.forEach((l, i) => {
    if (/^\s*- alert\b/.test(l)) found.push(`- alert on the page: ${l.replace(/^\s*- alert:?\s*/, '').replace(/\[ref=[^\]]+\]\s*/g, '')}`);
    if (/\[invalid\]/.test(l)) {
      const value = lines[i + 2]?.match(/text: (.*)$/)?.[1] ?? lines[i + 1]?.match(/text: (.*)$/)?.[1] ?? '';
      found.push(`- invalid field: ${l.trim().replace(/^- /, '').replace(/\s*\[(invalid|ref=[^\]]+)\]/g, '').replace(/:$/, '')}${value ? ` (value ${value})` : ''}`);
    }
  });
  return found.length ? `\n\nWhat the page showed when the test failed:\n${[...new Set(found)].slice(0, 8).join('\n')}` : '';
}

/**
 * The failing test's network/console evidence, from the diagnostics fixture (Project 2). A timeout
 * alone often hides the reason: in benchmark run 1, S09 failed 3 times on "login page never appeared"
 * while the API had answered 422 "password has appeared in a data leak". Now the model sees that.
 */
function describeDiagnostics(attachments: { name: string; body?: string; path?: string }[]): string {
  // Playwright stores attach() bodies either inline (base64) or as a file next to the results.
  const a = attachments.find((x) => x.name === 'diagnostics' && (x.body || x.path));
  if (!a) return '';
  try {
    const raw = a.body ? Buffer.from(a.body, 'base64').toString('utf8') : existsSync(a.path!) ? readFileSync(a.path!, 'utf8') : '';
    if (!raw) return '';
    const d = JSON.parse(raw) as {
      httpErrors?: { method: string; url: string; status: number; body?: string }[];
      consoleErrors?: string[];
    };
    // The anonymous session check (/users/me 401) is normal for this app: don't send it as a clue.
    const http = (d.httpErrors ?? []).filter((e) => !(e.status === 401 && /\/users\/me$/.test(e.url)));
    const lines = [
      ...http.slice(0, 5).map((e) => `- HTTP ${e.status} ${e.method} ${e.url.replace(/^https?:\/\/[^/]+/, '')}: ${(e.body ?? '').slice(0, 200)}`),
      ...(d.consoleErrors ?? []).filter((c) => !/Unauthorized|401/.test(c)).slice(0, 3).map((c) => `- console: ${c.slice(0, 160)}`),
    ];
    return lines.length ? `\n\nWhat the app reported while the test ran:\n${lines.join('\n')}` : '';
  } catch {
    return '';
  }
}

export function runSpec(file: string, mutant?: string): RunResult {
  const jsonOut = join(PKG, '.last-run.json');
  rmSync(jsonOut, { force: true });
  const start = Date.now();
  const res = spawnSync('npx', ['playwright', 'test', '-c', CONFIG, relative(PKG, file).replace(/\\/g, '/'), '--reporter=json'], {
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, MUTANT: mutant ?? '', PLAYWRIGHT_JSON_OUTPUT_FILE: jsonOut, PLAYWRIGHT_JSON_OUTPUT_NAME: jsonOut },
  });
  const durationMs = Date.now() - start;
  if (!existsSync(jsonOut)) {
    return { status: 'error', error: `Playwright produced no report: ${(res.stderr || res.stdout).replace(ANSI, '').slice(0, 600)}`, durationMs };
  }
  const report = JSON.parse(readFileSync(jsonOut, 'utf8'));
  const tests: { status: string; results: { error?: { message?: string }; attachments?: { name: string; body?: string; path?: string }[] }[] }[] = [];
  const walk = (s: { specs?: { tests: typeof tests }[]; suites?: unknown[] }) => {
    for (const sp of s.specs ?? []) tests.push(...sp.tests);
    for (const c of (s.suites ?? []) as (typeof s)[]) walk(c);
  };
  (report.suites ?? []).forEach(walk);
  const loadErrors = (report.errors ?? []).map((e: { message?: string }) => e.message ?? '').join('\n');
  if (!tests.length) return { status: 'error', error: `No test ran. ${loadErrors}`.replace(ANSI, '').slice(0, 800), durationMs };

  const failed = tests.find((t) => t.status === 'unexpected' || t.status === 'flaky');
  if (failed) {
    const msg = failed.results.map((r) => r.error?.message ?? '').join('\n').replace(ANSI, '');
    const attachments = failed.results.flatMap((r) => r.attachments ?? []);
    const evidence = describePageMessages(attachments) + describeDiagnostics(attachments);
    return { status: 'failed', error: msg.split('\n').slice(0, 25).join('\n') + evidence, durationMs };
  }
  if (tests.every((t) => t.status === 'skipped')) return { status: 'skipped', error: 'all tests skipped', durationMs };
  return { status: 'passed', error: '', durationMs };
}
