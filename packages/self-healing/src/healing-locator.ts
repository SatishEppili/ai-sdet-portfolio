/**
 * healable(page, testId) returns something that IS a Playwright Locator (a Proxy around one),
 * so page objects and tests don't change. Before an action or a positive assertion it checks the
 * locator still matches; if not, it asks the healer for the element and uses that instead.
 *
 * It deliberately does NOT heal when "not found" can be the right answer:
 *  - negative assertions (expect(x).not.toBeVisible(), toBeHidden, toHaveCount)
 *  - list/query calls (count, all, allTextContents, isVisible…)
 *  - chains that still match something (an .or() alternative, a filter's row): only an empty
 *    chain whose root element is also gone counts as broken
 */
import { test, type Locator, type Page } from '@playwright/test';
import { inspectInPage } from './describe';
import { heal, type Healed } from './healer';
import { fingerprintKey, normaliseRoute, store } from './store';
import type { Fingerprint, HealMode, HealResult } from './types';

export const healMode = (): HealMode => {
  const m = (process.env.SELF_HEAL ?? 'heal').toLowerCase();
  return m === 'off' || m === 'learn' ? m : 'heal';
};

/** How long to wait for the original locator before treating it as broken. */
const PROBE_MS = Number(process.env.SELF_HEAL_PROBE_MS ?? 4000);

const ACTIONS = new Set([
  'click', 'dblclick', 'tap', 'fill', 'clear', 'press', 'pressSequentially', 'type', 'check', 'uncheck', 'setChecked',
  'selectOption', 'selectText', 'hover', 'focus', 'blur', 'setInputFiles', 'dragTo', 'scrollIntoViewIfNeeded',
  'textContent', 'innerText', 'innerHTML', 'inputValue', 'getAttribute', 'boundingBox', 'screenshot', 'dispatchEvent',
]);
const CHAIN = new Set([
  'first', 'last', 'nth', 'filter', 'locator', 'and', 'or',
  'getByTestId', 'getByRole', 'getByText', 'getByLabel', 'getByPlaceholder', 'getByAltText', 'getByTitle',
]);
/** Positive assertions where "element missing" means the locator is broken. */
const HEALABLE_EXPECTATIONS = new Set([
  'to.be.visible', 'to.be.attached', 'to.be.enabled', 'to.be.disabled', 'to.be.editable', 'to.be.checked', 'to.be.focused',
  'to.be.in.viewport', 'to.have.text', 'to.contain.text', 'to.have.value', 'to.have.attribute', 'to.have.attribute.value',
  'to.have.accessible.name', 'to.have.class', 'to.contain.class', 'to.have.id', 'to.have.role', 'to.have.css',
]);

interface Op { name: string; args: unknown[] }
interface State { page: Page; testId: string; root: Locator; healed?: Locator; healResult?: HealResult }

export function healable(page: Page, testId: string): Locator {
  const root = page.getByTestId(testId);
  if (healMode() === 'off') return root;
  return wrap(root, { page, testId, root }, []);
}

function wrap(target: Locator, state: State, ops: Op[]): Locator {
  return new Proxy(target, {
    get(t, prop) {
      const value = Reflect.get(t, prop, t);
      if (typeof prop !== 'string' || typeof value !== 'function') return value;

      if (CHAIN.has(prop)) {
        return (...args: unknown[]) => wrap(value.apply(t, args), state, [...ops, { name: prop, args }]);
      }
      if (ACTIONS.has(prop)) {
        return async (...args: unknown[]) => {
          const resolved = await resolve(state, ops, t);
          return (resolved as any)[prop](...args);
        };
      }
      if (prop === '_expect') {
        return async (expression: string, options: { isNot?: boolean }) => {
          const mayHeal = HEALABLE_EXPECTATIONS.has(expression) && !options?.isNot;
          const resolved = mayHeal ? await resolve(state, ops, t) : t;
          return (resolved as any)._expect(expression, options);
        };
      }
      return value.bind(t);
    },
  });
}

/** Re-applies the chain (first(), filter()…) on top of a (possibly healed) root. */
function applyOps(root: Locator, ops: Op[]): Locator {
  return ops.reduce((loc, op) => (loc as any)[op.name](...op.args), root);
}

async function resolve(state: State, ops: Op[], original: Locator): Promise<Locator> {
  if (state.healed) return applyOps(state.healed, ops);

  // Probe the FULL locator first: if it matches (e.g. the `.or()` alternative is showing, or a
  // filter found its row), nothing is broken. Only an empty chain whose root element is also
  // gone counts as a broken locator.
  const present = await original.first().waitFor({ state: 'attached', timeout: PROBE_MS }).then(() => true, () => false);
  const route = normaliseRoute(state.page.url());
  const rootPresent = present || (await state.root.count()) > 0;

  if (healMode() === 'learn' && rootPresent) await learn(state, route);
  if (rootPresent || healMode() !== 'heal') return original;

  const fp = store.get(route, state.testId);
  if (!fp) {
    note('self-heal-skipped', `getByTestId('${state.testId}') missing on ${route}, but no fingerprint was recorded for it`);
    return original; // nothing to compare with: let the test fail normally
  }

  const outcome = await heal(state.page, fp);
  if (!('locator' in outcome)) {
    await report(outcome);
    return original; // refused: the test fails on the original locator, as it should
  }
  const { locator, result } = outcome as Healed;
  state.healed = locator;
  state.healResult = result;
  await report(result);
  return applyOps(locator, ops);
}

async function learn(state: State, route: string) {
  const key = fingerprintKey(route, state.testId);
  const { count, items } = await state.root.evaluateAll(inspectInPage, { limit: 1, tag: false });
  if (!items.length) return;
  const list = count > 1;
  const fp: Fingerprint = {
    ...items[0],
    // List content (product names, prices) changes with sorting/search: keep only the structure.
    name: list ? '' : items[0].name,
    text: list ? '' : items[0].text,
    key,
    route,
    count: list ? 2 : 1,
    recordedAt: new Date().toISOString(),
  };
  delete (fp as Partial<Fingerprint> & { index?: number }).index;
  store.record(fp);
}

function note(type: string, description: string) {
  try {
    test.info().annotations.push({ type, description });
  } catch {
    /* not inside a test */
  }
}

async function report(r: HealResult) {
  const msg = r.ok
    ? `healed getByTestId('${r.testId}') -> ${r.newLocator} on ${r.route} [${r.strategy}, similarity ${r.score?.toFixed(2)}]: ${r.reason}`
    : `refused to heal getByTestId('${r.testId}') on ${r.route}: ${r.reason}`;
  console.warn(`[self-heal] ${msg}`);
  note(r.ok ? 'self-healed' : 'self-heal-refused', msg);
  try {
    await test.info().attach(r.ok ? 'self-heal' : 'self-heal-refused', { contentType: 'application/json', body: JSON.stringify(r, null, 2) });
  } catch {
    /* not inside a test */
  }
}
