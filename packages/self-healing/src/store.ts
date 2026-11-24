/**
 * Fingerprints live in .self-healing/fingerprints.json (committed, like visual baselines).
 * In learn mode each worker writes what it saw to .self-healing/learned/<pid>.json on exit;
 * `npm run heal:learn` merges those into fingerprints.json.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Fingerprint } from './types';

export const STORE_DIR = process.env.SELF_HEAL_DIR ?? '.self-healing';
export const STORE_FILE = join(STORE_DIR, 'fingerprints.json');
const LEARNED_DIR = join(STORE_DIR, 'learned');

/** /product/01M7Z6GXB1FJTC2MPCFFW22R2Q -> /product/:id (ULIDs, UUIDs, numbers). */
export function normaliseRoute(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  return path
    .split('/')
    .map((seg) => (/^(\d+|[0-9a-z]{20,}|[0-9a-f-]{32,36})$/i.test(seg) ? ':id' : seg))
    .join('/') || '/';
}

export const fingerprintKey = (route: string, testId: string) => `${route}::${testId}`;

/**
 * Combines two observations of the same element. Whatever differs between them is content,
 * not identity (a random test user's name, whichever product happened to be in stock), so it is
 * dropped. A list is a list if it was ever seen with more than one match (a search can filter
 * the product grid down to one card).
 */
export function combine(a: Fingerprint, b: Fingerprint): Fingerprint {
  const count = Math.max(a.count, b.count);
  const keep = (x: string, y: string) => (count > 1 || x !== y ? '' : x);
  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(a.attrs)) if (b.attrs[k] === v) attrs[k] = v;
  return {
    ...a,
    count,
    name: keep(a.name, b.name),
    text: keep(a.text, b.text),
    attrs,
    classes: a.classes.filter((c) => b.classes.includes(c)),
    ancestorTestId: a.ancestorTestId === b.ancestorTestId ? a.ancestorTestId : '',
    visible: a.visible || b.visible,
  };
}

const sameIdentity = (a: Fingerprint, b: Fingerprint) => {
  const { recordedAt: _a, ...x } = a;
  const { recordedAt: _b, ...y } = b;
  return JSON.stringify(x) === JSON.stringify(y);
};

class FingerprintStore {
  private known = new Map<string, Fingerprint>();
  private learned = new Map<string, Fingerprint>();
  private exitHook = false;

  constructor() {
    if (existsSync(STORE_FILE)) {
      for (const fp of JSON.parse(readFileSync(STORE_FILE, 'utf8')) as Fingerprint[]) this.known.set(fp.key, fp);
    }
  }

  get(route: string, testId: string): Fingerprint | undefined {
    return this.known.get(fingerprintKey(route, testId));
  }

  record(fp: Fingerprint) {
    const prev = this.learned.get(fp.key);
    this.learned.set(fp.key, prev ? combine(prev, fp) : fp);
    if (!this.exitHook) {
      this.exitHook = true;
      process.on('exit', () => this.flushLearned());
    }
  }

  private flushLearned() {
    if (!this.learned.size) return;
    mkdirSync(LEARNED_DIR, { recursive: true });
    writeFileSync(join(LEARNED_DIR, `${process.pid}.json`), JSON.stringify([...this.learned.values()], null, 2));
  }
}

export const store = new FingerprintStore();

/** Merge per-worker learned files into fingerprints.json (newest wins). Returns the count. */
export function mergeLearned(): { total: number; added: number; updated: number } {
  const merged = new Map<string, Fingerprint>();
  if (existsSync(STORE_FILE)) for (const fp of JSON.parse(readFileSync(STORE_FILE, 'utf8')) as Fingerprint[]) merged.set(fp.key, fp);
  const before = new Map(merged);
  if (existsSync(LEARNED_DIR)) {
    for (const f of readdirSync(LEARNED_DIR).filter((n) => n.endsWith('.json'))) {
      for (const fp of JSON.parse(readFileSync(join(LEARNED_DIR, f), 'utf8')) as Fingerprint[]) {
        const cur = merged.get(fp.key);
        if (!cur) {
          merged.set(fp.key, fp);
          continue;
        }
        // Unchanged elements keep their old record, so the committed file only diffs on real changes.
        const next = combine(cur, fp);
        if (!sameIdentity(cur, next)) merged.set(fp.key, { ...next, recordedAt: fp.recordedAt });
      }
    }
    rmSync(LEARNED_DIR, { recursive: true, force: true });
  }
  mkdirSync(STORE_DIR, { recursive: true });
  const list = [...merged.values()].sort((a, b) => a.key.localeCompare(b.key));
  writeFileSync(STORE_FILE, JSON.stringify(list, null, 2) + '\n');
  return {
    total: list.length,
    added: list.filter((fp) => !before.has(fp.key)).length,
    updated: list.filter((fp) => before.has(fp.key) && !sameIdentity(before.get(fp.key)!, fp)).length,
  };
}
