/**
 * Deterministic similarity between a fingerprint (what the element used to look like) and a
 * candidate on the current page. 0..1. Fields that are empty on both sides are skipped and the
 * remaining weights renormalised, so a plain <span> isn't punished for having no placeholder.
 */
import type { ElementDescriptor } from './types';

const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1),
  );

export function jaccard(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Normalised Levenshtein similarity, for renamed ids like product-name -> product-title. */
export function editSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

const textSim = (a: string, b: string) => Math.max(jaccard(a, b), a && b && a.toLowerCase() === b.toLowerCase() ? 1 : 0);
const idSim = (a: string, b: string) => Math.max(jaccard(a, b), editSimilarity(a.toLowerCase(), b.toLowerCase()));

/** product-01M86XQ0F7GZ2QSA5XKTY1FP63 -> product-:id, so per-record ids don't look like differences. */
export const normaliseId = (s: string) => s.replace(/[0-9A-Za-z]{20,}|\d{3,}/g, ':id');

/** Weighted parts, exposed so the heal log can explain a score. */
export function similarityParts(fp: ElementDescriptor, c: ElementDescriptor): Record<string, { w: number; s: number }> {
  const parts: Record<string, { w: number; s: number }> = {};
  const add = (name: string, w: number, a: string, b: string, sim: (x: string, y: string) => number) => {
    if (!a && !b) return;
    parts[name] = { w, s: a && b ? sim(a, b) : 0 };
  };
  /** Content fields: empty in a fingerprint means "unknown/volatile" (dropped while learning), not "empty". */
  const addContent = (name: string, w: number, a: string, b: string) => {
    if (a) parts[name] = { w, s: b ? textSim(a, b) : 0 };
  };
  add('tag', 0.12, fp.tag, c.tag, (x, y) => (x === y ? 1 : 0));
  add('role', 0.12, fp.role, c.role, (x, y) => (x === y ? 1 : 0));
  addContent('name', 0.22, fp.name, c.name);
  addContent('text', 0.1, fp.text, c.text);
  add('testId', 0.12, normaliseId(fp.testId), normaliseId(c.testId), idSim);
  add('ancestor', 0.05, normaliseId(fp.ancestorTestId), normaliseId(c.ancestorTestId), (x, y) => (x === y ? 1 : 0));
  add('classes', 0.05, fp.classes.join(' '), c.classes.join(' '), jaccard);
  for (const a of ['id', 'name', 'type', 'placeholder', 'href', 'aria-label']) {
    add(`attr:${a}`, a === 'type' ? 0.06 : 0.04, fp.attrs[a] ?? '', c.attrs[a] ?? '', a === 'id' ? idSim : textSim);
  }
  return parts;
}

export function similarity(fp: ElementDescriptor, c: ElementDescriptor): number {
  const parts = Object.values(similarityParts(fp, c));
  const total = parts.reduce((s, p) => s + p.w, 0);
  return total ? parts.reduce((s, p) => s + p.w * p.s, 0) / total : 0;
}
