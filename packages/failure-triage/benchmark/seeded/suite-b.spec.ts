// Ground truth: PRODUCT BUGS (the test is right; the backend regresses). Simulated by
// rewriting real API responses, the way an API regression would surface in the UI.
//  #06 sort returns descending · #07 search ignores the query · #08 a product priced 0
//  #09 contact API rejects a valid email (422) · #10 login throws an app exception (500)
import { test, expect, truth, isApi, mutateApi, caseId, API_URL, type Fault } from './helpers';

const faults: Record<string, Fault> = {
  '#06': (page) =>
    mutateApi(page, /^\/products$/, (b) => ({ ...b, data: [...b.data].reverse() }), (req) => /price\W{0,6}asc/i.test(req.postData() ?? '')),
  '#07': (page) =>
    page.route((u) => isApi(u, /^\/products\/search/), async (route) => {
      const all = await page.request.get(`${API_URL}/products?page=1`);
      await route.fulfill({ json: await all.json() });
    }),
  '#08': (page) => mutateApi(page, /^\/products$/, (b) => ({ ...b, data: b.data.map((p: any, i: number) => (i === 2 ? { ...p, price: 0 } : p)) })),
  '#09': (page) =>
    page.route((u) => isApi(u, /\/messages/), (route) =>
      route.fulfill({
        status: 422,
        json: { message: 'The email field must be a valid email address.', errors: { email: ['The email field must be a valid email address.'] } },
      }),
    ),
  '#10': (page) =>
    page.route((u) => isApi(u, /\/users\/login/), (route) =>
      route.fulfill({
        status: 500,
        json: { message: 'Undefined array key "role"', exception: 'ErrorException', file: '/var/www/app/Http/Controllers/UserController.php', line: 212 },
      }),
    ),
};

test.describe('Toolshop', () => {
  test.beforeEach(async ({ page }, info) => faults[caseId(info)]?.(page, info));

  test('#06 sort by price low to high', truth('product-bug'), async ({ homePage }) => {
    await homePage.open();
    const before = await homePage.productNames.first().textContent();
    await homePage.sortBy('Price (Low - High)');
    await expect(homePage.productNames.first()).not.toHaveText(before ?? '');

    const prices = await homePage.prices();
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  test('#07 search returns only matching products', truth('product-bug'), async ({ homePage }) => {
    await homePage.open();
    await homePage.search('pliers');
    await expect
      .poll(async () => {
        const names = await homePage.productNames.allTextContents();
        return names.length > 0 && names.every((n) => /pliers/i.test(n));
      }, {
        message: 'every visible product name should contain "pliers"',
      })
      .toBe(true);
  });

  test('#08 every listed product has a positive price', truth('product-bug'), async ({ homePage }) => {
    await homePage.open();
    for (const price of await homePage.prices()) expect(price).toBeGreaterThan(0);
  });

  test('#09 a valid contact message is accepted', truth('product-bug'), async ({ contactPage }) => {
    await contactPage.open();
    await contactPage.send({
      firstName: 'Ada', lastName: 'Lovelace', email: 'ada.lovelace@example.com', subject: 'Customer service',
      message: 'A perfectly valid message that is long enough to pass the client-side validation rules.',
    });
    await expect(contactPage.success).toBeVisible();
  });

  test('#10 registered customer can log in', truth('product-bug'), async ({ page, loginPage, customer }) => {
    await loginPage.open();
    await loginPage.login(customer.email, customer.password);
    await expect(page).toHaveURL(/\/account$/);
  });
});
