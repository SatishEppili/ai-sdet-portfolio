/**
 * What changed in this PR / push, from git. A reviewer's first question on a red build is
 * "did we just change the test, or did the app change under it?". The failure alone can't
 * answer that (a wrong expected value looks exactly like the app rendering the wrong value),
 * but the diff can.
 */
import { execFileSync } from 'node:child_process';
import type { FailureRecord } from './types';

/** "other-code" = anything that isn't test code or CI config: app code in a monorepo, tooling here. */
export type FileKind = 'test-code' | 'ci-config' | 'other-code';

export interface ChangedFile {
  status: string; // A, M, D, R…
  path: string;
  kind: FileKind;
}

export interface ChangeContext {
  base: string;
  files: ChangedFile[];
}

export interface RelevantChange {
  /** The failing spec file itself was modified. */
  specChanged: boolean;
  testCode: string[];
  otherCode: string[];
  ciConfig: string[];
  /** Unified diff of the failing spec + test-support files, trimmed. */
  diff: string;
}

const DIFF_MAX = 2500;

const TEST_CODE = /(^|\/)(tests?|e2e|specs?|pages|fixtures)\/|\.(spec|test)\.[cm]?[jt]sx?$|playwright\.config/;
const CI_CONFIG = /^(\.github|docker)\/|(^|\/)(package(-lock)?\.json|tsconfig\.json|\.env\.example|Dockerfile)$/;

export const classifyPath = (p: string): FileKind => (TEST_CODE.test(p) ? 'test-code' : CI_CONFIG.test(p) ? 'ci-config' : 'other-code');

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

/** Returns undefined (no context) rather than failing when git or the base commit is unavailable. */
export function loadChangeContext(base?: string): ChangeContext | undefined {
  if (!base || /^0+$/.test(base)) return undefined; // GitHub sends 000… for a branch's first push
  try {
    const files = git('diff', '--name-status', '--no-renames', `${base}...HEAD`)
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [status, path] = line.split('\t');
        return { status: status[0], path, kind: classifyPath(path) };
      });
    return { base, files };
  } catch (err) {
    console.warn(`[triage] no change context for base ${base}: ${(err as Error).message.split('\n')[0]}`);
    return undefined;
  }
}

/** Repo-relative path of the failing spec, e.g. "tests/ui/auth.spec.ts". */
const specPath = (f: FailureRecord) => (f.error.location ?? f.file).replace(/:\d+$/, '').replace(/\\/g, '/');

export function relevantChanges(ctx: ChangeContext, f: FailureRecord): RelevantChange {
  const spec = specPath(f);
  const byKind = (k: FileKind) => ctx.files.filter((c) => c.kind === k).map((c) => `${c.status} ${c.path}`);
  const specFile = ctx.files.find((c) => c.path === spec || c.path.endsWith(`/${spec}`) || spec.endsWith(c.path));

  // Diff the failing spec first, then other test-support code (page objects, fixtures).
  const paths = [
    ...(specFile ? [specFile.path] : []),
    ...ctx.files.filter((c) => c.kind === 'test-code' && c !== specFile && !/\.spec\.|\.test\./.test(c.path)).map((c) => c.path),
  ];
  let diff = '';
  if (paths.length) {
    try {
      diff = git('diff', '--unified=2', '--no-color', `${ctx.base}...HEAD`, '--', ...paths);
    } catch {
      /* diff is a nice-to-have */
    }
  }
  return {
    specChanged: !!specFile,
    testCode: byKind('test-code'),
    otherCode: byKind('other-code'),
    ciConfig: byKind('ci-config'),
    diff: diff.length > DIFF_MAX ? `${diff.slice(0, DIFF_MAX)}\n…(diff truncated)` : diff,
  };
}
