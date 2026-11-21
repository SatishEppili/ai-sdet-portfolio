// Ground truth: TEST BUGS (the app is fine, the test is wrong).
//  #01 typo in locator · #02 ambiguous locator (strict mode) · #03 wrong expected title
//  #04 reads results without waiting (race in the test) · #05 hard-coded user that does not exist
import { test, expect, truth, isApi, sleep, caseId, type Fault } from './helpers';

const faults: Record<string, Fault> = {
  // Not a fault in the app: search is just realistically slow, which exposes the test's race.
  '#04': async (page) => page.route((u) => isApi(u, /\/products\/search/), async (r) => { await sleep(1500); await r.continue(); }),
};

test.describe('Toolshop', () => {
  test.beforeEach(async ({ page }, info) => faults[caseId(info)]?.(page, info));

  test('#01 product grid shows product names', truth('test-bug'), async ({ page, homePage }) => {
    await homePage.open();
    await expect(page.getByTestId('product-nme').first()).toBeVisible();
  });

  test('#02 opening the first product', truth('test-bug'), async ({ page, homePage }) => {
    await homePage.open();
    await page.getByTestId('product-name').click();
    await expect(page).toHaveURL(/\/product\//);
  });

  test('#03 home page has the right title', truth('test-bug'), async ({ page, homePage }) => {
    await homePage.open();
    await expect(page).toHaveTitle('Toolshop - Home');
  });

  test('#04 search filters the grid', truth('test-bug'), async ({ page, homePage }) => {
    await homePage.open();
    await page.getByTestId('search-query').fill('pliers');
    await page.getByTestId('search-submit').click();
    const names = await homePage.productNames.allTextContents();
    expect(names.every((n) => /pliers/i.test(n))).toBe(true);
  });

  test('#05 customer can log in', truth('test-bug'), async ({ page, loginPage }) => {
    await loginPage.open();
    await loginPage.login('jane.doe.qa@example.com', 'Password123!');
    await expect(page).toHaveURL(/\/account$/);
  });
});
