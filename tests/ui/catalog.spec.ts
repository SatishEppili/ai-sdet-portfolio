import { test, expect } from '../../src/fixtures/test';

test.describe('Product catalog', () => {
  test.beforeEach(async ({ homePage }) => {
    await homePage.open();
  });

  test('search returns only matching products', async ({ homePage }) => {
    await homePage.search('pliers');

    // Poll: the grid re-renders after the response, so a one-shot read can see stale items.
    await expect
      .poll(async () => {
        const names = await homePage.productNames.allTextContents();
        return names.length > 0 && names.every((n) => /pliers/i.test(n));
      }, { message: 'every visible product name should contain "pliers"' })
      .toBe(true);
  });

  test('search with no matches shows an empty state', async ({ page, homePage }) => {
    await homePage.search('zzz-no-such-tool');

    await expect(page.getByText(/no products found/i)).toBeVisible();
    await expect(homePage.productNames).toHaveCount(0);
  });

  test('sort by price low to high orders products ascending', async ({ homePage }) => {
    const before = await homePage.productNames.first().textContent();
    await homePage.sortBy('Price (Low - High)');
    await expect(homePage.productNames.first()).not.toHaveText(before ?? '');

    const prices = await homePage.prices();
    expect(prices.length).toBeGreaterThan(1);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  test('category filter shows only products from that category', async ({ homePage }) => {
    await homePage.filterByCategory('Hammer');

    await expect
      .poll(async () => {
        const names = await homePage.productNames.allTextContents();
        return names.length > 0 && names.every((n) => /hammer/i.test(n));
      }, { message: 'every product under the Hammer filter should be a hammer' })
      .toBe(true);
  });

  test('customer can add an in-stock product to the cart', async ({ homePage, productPage, inStockProduct }) => {
    await homePage.findAndOpenProduct(inStockProduct.name);
    await expect(productPage.name).toHaveText(inStockProduct.name);

    await productPage.add(2);
    await expect(productPage.cartQuantity).toHaveText('2');
  });
});
