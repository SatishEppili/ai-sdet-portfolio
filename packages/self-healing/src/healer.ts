/**
 * Finds where a broken locator's element went, or refuses.
 *
 *  1. Describe every plausible element on the page (same describer as the fingerprint).
 *  2. Score each against the fingerprint (deterministic, similarity.ts).
 *  3. Clear winner -> take it. Nothing similar -> refuse. In between -> ask the LLM to pick
 *     from the top candidates (or say "none").
 *  4. Build a stable locator for the pick (data-test > id > role+name) and verify it really
 *     resolves to that element, and to one element / a list just like the fingerprint.
 *
 * A wrong heal is worse than a failure (the test passes on the wrong element and hides a
 * real bug), so every uncertain path ends in a refusal.
 */
import type { Locator, Page } from '@playwright/test';
import { LlmClient } from '../../core/src/llm-client';
import { CANDIDATE_SELECTOR, inspectInPage } from './describe';
import { similarity } from './similarity';
import type { Candidate, Fingerprint, HealResult } from './types';

export const THRESHOLDS = {
  /** Accept without the LLM when the best score is at least this... */
  auto: Number(process.env.SELF_HEAL_AUTO ?? 0.8),
  /** ...and beats the runner-up by at least this. */
  margin: Number(process.env.SELF_HEAL_MARGIN ?? 0.15),
  /** Below this nothing is similar enough to even ask. */
  floor: Number(process.env.SELF_HEAL_FLOOR ?? 0.4),
  /** The LLM's pick must still score at least this. */
  llmMin: Number(process.env.SELF_HEAL_LLM_MIN ?? 0.5),
  llmConfidence: 0.6,
};

const MAX_CANDIDATES = 400;
const LLM_SHORTLIST = 10;

let llm: LlmClient | null | undefined;
function getLlm(): LlmClient | null {
  if (llm !== undefined) return llm;
  try {
    llm = process.env.LLM_PROVIDER === 'none' ? null : new LlmClient();
  } catch {
    llm = null;
  }
  return llm;
}

export interface Healed {
  locator: Locator;
  result: HealResult;
}

export async function heal(page: Page, fp: Fingerprint): Promise<Healed | HealResult> {
  const start = Date.now();
  const refuse = (reason: string, candidates = 0, extra: Partial<HealResult> = {}): HealResult => ({
    ok: false, testId: fp.testId, route: fp.route, reason, candidates, ms: Date.now() - start, ...extra,
  });

  const { items } = await page.locator(CANDIDATE_SELECTOR).evaluateAll(inspectInPage, { limit: MAX_CANDIDATES, tag: true });
  try {
    const scored: Candidate[] = items
      .filter((c) => c.visible || !fp.visible)
      .map((c) => ({ ...c, score: similarity(fp, c) }))
      .sort((a, b) => b.score - a.score);
    if (!scored.length) return refuse('no candidate elements on the page');

    // Lists: one row per distinct data-test, so 9 product cards don't crowd out other candidates.
    const shortlist = dedupe(scored).slice(0, LLM_SHORTLIST);
    const [best, second] = shortlist;
    const gap = best.score - (second?.score ?? 0);

    if (best.score < THRESHOLDS.floor) {
      return refuse(`nothing similar on the page (best ${fmt(best.score)} < ${THRESHOLDS.floor})`, scored.length, { score: best.score });
    }

    let pick: Candidate | undefined;
    let strategy: HealResult['strategy'];
    let confidence = best.score;
    let reason: string;

    if (best.score >= THRESHOLDS.auto && gap >= THRESHOLDS.margin) {
      pick = best;
      strategy = 'fingerprint';
      reason = `clear fingerprint match (${fmt(best.score)}, next ${fmt(second?.score ?? 0)})`;
    } else {
      const client = getLlm();
      if (!client) return refuse(`ambiguous (best ${fmt(best.score)}, gap ${fmt(gap)}) and no LLM available`, scored.length, { score: best.score });
      const verdict = await askLlm(client, fp, shortlist);
      if ('error' in verdict) {
        // Not the same as "no match": report honestly so the benchmark doesn't count it as a decision.
        return refuse(`LLM unavailable (${verdict.error}); ambiguous match not risked`, scored.length, { score: best.score, strategy: 'llm' });
      }
      if (verdict.index < 0) {
        return refuse(`LLM: no match${verdict.reason ? ` (${verdict.reason})` : ''}`, scored.length, { score: best.score, strategy: 'llm' });
      }
      pick = shortlist.find((c) => c.index === verdict.index);
      if (!pick) return refuse(`LLM picked unknown index ${verdict.index}`, scored.length, { strategy: 'llm' });
      if (verdict.confidence < THRESHOLDS.llmConfidence || pick.score < THRESHOLDS.llmMin) {
        return refuse(
          `LLM pick not trustworthy (confidence ${fmt(verdict.confidence)}, similarity ${fmt(pick.score)})`,
          scored.length,
          { score: pick.score, confidence: verdict.confidence, strategy: 'llm' },
        );
      }
      strategy = 'llm';
      confidence = verdict.confidence;
      reason = `LLM: ${verdict.reason}`;
    }

    const built = await buildLocator(page, fp, pick);
    if (!built) return refuse(`no stable locator verifies for the chosen element (${describe(pick)})`, scored.length, { score: pick.score, strategy });

    return {
      locator: built.locator,
      result: {
        ok: true, testId: fp.testId, route: fp.route, newLocator: built.description,
        suggestedTestId: pick.testId && pick.testId !== fp.testId ? pick.testId : undefined,
        strategy, score: pick.score, confidence, reason, candidates: scored.length, ms: Date.now() - start,
      },
    };
  } finally {
    await page.evaluate(() => document.querySelectorAll('[data-heal-id]').forEach((e) => e.removeAttribute('data-heal-id'))).catch(() => {});
  }
}

function dedupe(cs: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return cs.filter((c) => {
    const k = c.testId ? `t:${c.testId}` : `i:${c.index}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Tries stable locators for the pick and keeps the first that verifiably points at it. */
async function buildLocator(page: Page, fp: Fingerprint, pick: Candidate): Promise<{ locator: Locator; description: string } | undefined> {
  const wantList = fp.count > 1;
  const options: { locator: Locator; description: string }[] = [];
  if (pick.testId) options.push({ locator: page.getByTestId(pick.testId), description: `getByTestId('${pick.testId}')` });
  if (pick.attrs.id) options.push({ locator: page.locator(`[id="${pick.attrs.id}"]`), description: `locator('#${pick.attrs.id}')` });
  if (pick.role && pick.name) {
    options.push({
      locator: page.getByRole(pick.role as Parameters<Page['getByRole']>[0], { name: pick.name, exact: true }),
      description: `getByRole('${pick.role}', { name: '${pick.name}' })`,
    });
  }

  for (const opt of options) {
    const ids = await opt.locator.evaluateAll((els) => els.map((e) => e.getAttribute('data-heal-id'))).catch(() => [] as (string | null)[]);
    const includesPick = ids.includes(String(pick.index));
    const shapeOk = wantList ? ids.length > 1 : ids.length === 1;
    if (includesPick && shapeOk) return opt;
  }
  return undefined;
}

interface LlmPick { index: number; confidence: number; reason: string }

const SYSTEM = `You repair broken UI-test locators. A test looked for an element by its data-test
attribute, but that attribute no longer matches anything. You get the element's FINGERPRINT (what
it looked like when the test last passed) and a shortlist of CANDIDATES currently on the page,
each with a deterministic similarity score.

Pick the candidate that is the SAME element after a refactor (renamed attribute, changed text,
moved in the page), or -1 if none is. Picking a different element is much worse than picking
none: it makes the test pass on the wrong element and hides real bugs.
- Same purpose matters most: an "Add to cart" button is not an "Add to favourites" button,
  an email field is not a password field, a submit button is not a reset button.
- If the element was clearly removed and only look-alikes remain, answer -1.

Reply with ONLY JSON: {"index": <candidate index or -1>, "confidence": 0.0-1.0, "reason": "<one sentence>"}`;

const PICK_SCHEMA = {
  name: 'heal_pick',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['index', 'confidence', 'reason'],
    properties: { index: { type: 'integer' }, confidence: { type: 'number' }, reason: { type: 'string' } },
  },
};

async function askLlm(client: LlmClient, fp: Fingerprint, shortlist: Candidate[]): Promise<LlmPick | { error: string }> {
  const view = (d: Candidate | Fingerprint) => ({
    tag: d.tag, role: d.role, name: d.name, text: d.text, 'data-test': d.testId, attrs: d.attrs, classes: d.classes, inside: d.ancestorTestId,
  });
  const user = [
    `BROKEN LOCATOR: getByTestId('${fp.testId}') on page ${fp.route} (${fp.count > 1 ? 'a list of elements' : 'a single element'})`,
    `FINGERPRINT: ${JSON.stringify(view(fp))}`,
    'CANDIDATES:',
    ...shortlist.map((c) => `[${c.index}] similarity ${fmt(c.score)} ${JSON.stringify(view(c))}`),
  ].join('\n');
  try {
    const v = await client.chatJson<LlmPick>(
      [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
      { temperature: 0, maxTokens: 300, schema: PICK_SCHEMA, timeoutMs: Number(process.env.SELF_HEAL_LLM_TIMEOUT_MS ?? 90_000) },
    );
    return { index: Number(v.index), confidence: Number(v.confidence) || 0, reason: String(v.reason ?? '') };
  } catch (err) {
    const error = (err as Error).message.split('\n')[0];
    console.warn(`[self-heal] LLM failed: ${error}`);
    return { error };
  }
}

const fmt = (n: number) => n.toFixed(2);
const describe = (c: Candidate) => `<${c.tag}${c.testId ? ` data-test="${c.testId}"` : ''}> "${c.name || c.text}"`;
