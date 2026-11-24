// SHOULD REFUSE: the element is really gone, and a look-alike decoy remains nearby. Healing
// onto the decoy would hide a real bug (the feature was removed), so the only correct outcome
// is "no heal" and a failing test.
import { test, expect } from '../../../../src/fixtures/test';
import { mutateDom } from './mutate';

const refuse = { annotation: { type: 'expected-heal', description: 'refuse' } };

test.describe('should refuse', () => {
  test('R1 add to cart removed (decoy: Add to favourites)', refuse, async ({ page, homePage, productPage, inStockProduct }) => {
    await mutateDom(page, [{ testId: 'add-to-cart', remove: true }]);
    await homePage.open();
    await homePage.findAndOpenProduct(inStockProduct.name);
    await productPage.add(1);
    await expect(productPage.cartQuantity).toHaveText('1');
  });

  test('R2 search button removed (decoy: reset button)', refuse, async ({ page, homePage }) => {
    await mutateDom(page, [{ testId: 'search-submit', remove: true }]);
    await homePage.open();
    await homePage.searchInput.fill('pliers');
    // Click the locator directly: HomePage.search() races the click against a 15 s response wait,
    // which can end the test before a slow (local LLM) heal decision is recorded.
    await homePage.searchSubmit.click();
  });

  test('R3 login button removed (decoy: Sign in with Google)', refuse, async ({ page, loginPage, customer }) => {
    await mutateDom(page, [{ testId: 'login-submit', remove: true }]);
    await loginPage.open();
    await loginPage.login(customer.email, customer.password);
    await expect(page).toHaveURL(/\/account$/);
  });

  test('R4 login email field removed (decoy: password field)', refuse, async ({ page, loginPage, customer }) => {
    await mutateDom(page, [{ testId: 'email', remove: true }]);
    await loginPage.open();
    await loginPage.login(customer.email, customer.password);
    await expect(page).toHaveURL(/\/account$/);
  });

  test('R5 contact submit removed (decoy: attachment input)', refuse, async ({ page, contactPage }) => {
    await mutateDom(page, [{ testId: 'contact-submit', remove: true }]);
    await contactPage.open();
    await contactPage.send({
      firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', subject: 'Customer service',
      message: 'Automated test message: checking the contact form accepts a valid submission end to end.',
    });
    await expect(contactPage.success).toBeVisible();
  });

  test('R6 product names removed from the grid (decoys: prices, badges)', refuse, async ({ page, homePage }) => {
    await mutateDom(page, [{ testId: 'product-name', remove: true }]);
    await page.goto('/');
    await expect(homePage.productNames.first()).toBeVisible();
  });
});
