/**
 * Mutants: deliberately broken versions of the app, one per benchmark story. A generated test is
 * only USEFUL if it passes on the real app AND fails on its story's mutant; a test that passes on
 * both checks nothing (a "fake pass"). Faults are injected by rewriting real API responses or the
 * DOM, the way a regression would surface.
 */
import type { Page } from '@playwright/test';
import { API_URL } from '../../../src/api/ToolshopApi';

type Mutant = (page: Page) => Promise<unknown>;

const api = (u: URL, path: RegExp) => u.href.startsWith(API_URL) && path.test(u.pathname);

/** Rewrite a JSON response from the API. */
const rewrite = (page: Page, path: RegExp, fn: (body: any, postData: string) => any, method?: string) =>
  page.route((u) => api(u, path), async (route) => {
    if (method && route.request().method() !== method) return route.fallback();
    const res = await route.fetch();
    await route.fulfill({ response: res, json: fn(await res.json(), route.request().postData() ?? '') });
  });

/** Fail an API call with a status. */
const failApi = (page: Page, path: RegExp, status: number, json: object, method = 'POST') =>
  page.route((u) => api(u, path), (route) =>
    route.request().method() === method ? route.fulfill({ status, json }) : route.fallback(),
  );

/** Remove elements with a data-test from the DOM as the app renders them (a UI regression). */
const hideElement = (page: Page, testId: string) =>
  page.addInitScript((id: string) => {
    const apply = () => document.querySelectorAll(`[data-test="${id}"]`).forEach((e) => e.remove());
    new MutationObserver(apply).observe(document, { childList: true, subtree: true });
  }, testId);

export const MUTANTS: Record<string, Mutant> = {
  /** Search ignores the query and returns the first page of the catalog. */
  'search-ignores-query': (page) =>
    page.route((u) => api(u, /^\/products\/search/), async (route) => {
      const all = await page.request.get(`${API_URL}/products?page=1`);
      await route.fulfill({ json: await all.json() });
    }),
  /** Sorting by price ascending returns the list in descending order. */
  'sort-reversed': (page) =>
    rewrite(page, /^\/products$/, (b, body) => (/price\W{0,6}asc/i.test(body) ? { ...b, data: [...b.data].reverse() } : b)),
  /** Category filter leaks a product from another category into the results. */
  'filter-leaks-product': (page) =>
    rewrite(page, /^\/products$/, (b, body) =>
      /by_category/.test(body) && b.data?.length ? { ...b, data: [...b.data, { ...b.data[0], id: 'leak', name: 'Cordless Drill 18V' }] } : b),
  /** Adding to the cart fails on the server. */
  'cart-add-fails': (page) => failApi(page, /^\/carts\/[^/]+$/, 500, { message: 'Server Error' }),
  /** Valid credentials are rejected. */
  'login-rejects-valid': (page) => failApi(page, /^\/users\/login$/, 401, { error: 'Unauthorized' }),
  /** The login error message is never shown. */
  'login-error-hidden': (page) => hideElement(page, 'login-error'),
  /** The contact form rejects a valid message. */
  'contact-rejects-valid': (page) =>
    failApi(page, /^\/messages$/, 422, { message: 'The email field must be a valid email address.', errors: { email: ['invalid'] } }),
  /** The email-required validation message is missing. */
  'contact-email-error-hidden': (page) => hideElement(page, 'email-error'),
  /** Registration fails as if the email already existed. */
  'register-rejects-new': (page) =>
    failApi(page, /^\/users\/register$/, 422, { email: ['A customer with this email address already exists.'] }),
  /** The product page shows a different price than the catalog. */
  'product-price-wrong': (page) =>
    rewrite(page, /^\/products\/[^/]+$/, (b) => (typeof b?.price === 'number' ? { ...b, price: Math.round(b.price * 200) / 100 } : b), 'GET'),
  /** Checkout never confirms the payment. */
  'payment-success-hidden': (page) => hideElement(page, 'payment-success-message'),
  /** A search with no matches shows the full catalog instead of an empty state. */
  'no-results-shows-all': (page) =>
    page.route((u) => api(u, /^\/products\/search/), async (route) => {
      const all = await page.request.get(`${API_URL}/products?page=1`);
      await route.fulfill({ json: await all.json() });
    }),
};
