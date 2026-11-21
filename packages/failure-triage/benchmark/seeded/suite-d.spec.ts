// Ground truth: FLAKY (fail on the first attempt only, then pass on retry).
//  #16 slow products API · #17 transient overlay over the grid · #18 one connection reset
//  #19 slow search · #20 slow login
import { test, expect, truth, isApi, sleep, caseId, API_URL, type Fault } from './helpers';

const firstAttemptOnly = (f: Fault): Fault => async (page, info) => (info.retry === 0 ? f(page, info) : undefined);
const slow = (path: RegExp, ms: number): Fault => (page) =>
  page.route((u) => isApi(u, path), async (r) => { await sleep(ms); await r.continue().catch(() => {}); });

const faults: Record<string, Fault> = {
  '#16': firstAttemptOnly(slow(/\/products/, 8000)),
  '#17': firstAttemptOnly((page) =>
    page.addInitScript(() =>
      window.addEventListener('DOMContentLoaded', () => {
        const d = document.createElement('div');
        d.id = 'cookie-banner';
        d.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.01)';
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 12000);
      }),
    ),
  ),
  '#18': firstAttemptOnly((page) =>
    page.route((u) => u.href.startsWith(API_URL) && u.pathname.startsWith('/products'), (r) => r.abort('connectionreset'), { times: 1 }),
  ),
  '#19': firstAttemptOnly(slow(/\/products\/search/, 7000)),
  '#20': firstAttemptOnly(slow(/\/users\/login/, 7000)),
};

test.describe('Toolshop', () => {
  test.beforeEach(async ({ page }, info) => faults[caseId(info)]?.(page, info));

  test('#16 products appear on the home page', truth('flaky'), async ({ page, homePage }) => {
    await page.goto('/');
    await expect(homePage.productNames.first()).toBeVisible();
  });

  test('#17 opening a product from the grid', truth('flaky'), async ({ page, homePage }) => {
    await homePage.open();
    await homePage.productNames.first().click({ timeout: 3000 });
    await expect(page).toHaveURL(/\/product\//);
  });

  test('#18 home page renders the catalog', truth('flaky'), async ({ page, homePage }) => {
    await page.goto('/');
    await expect(homePage.productNames.first()).toBeVisible();
  });

  test('#19 searching narrows the results', truth('flaky'), async ({ page, homePage }) => {
    await homePage.open();
    await page.getByTestId('search-query').fill('pliers');
    await page.getByTestId('search-submit').click();
    await expect
      .poll(async () => {
        const names = await homePage.productNames.allTextContents();
        return names.length > 0 && names.every((n) => /pliers/i.test(n));
      })
      .toBe(true);
  });

  test('#20 new customer can sign in', truth('flaky'), async ({ page, loginPage, customer }) => {
    await loginPage.open();
    await loginPage.login(customer.email, customer.password);
    await expect(page).toHaveURL(/\/account$/);
  });
});
