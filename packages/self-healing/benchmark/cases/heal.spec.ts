// SHOULD HEAL: the element is still there, its locator changed. Each test asserts the business
// outcome, so a heal onto the WRONG element fails the test (and is scored as a wrong heal).
import { test, expect } from '../../../../src/fixtures/test';
import { mutateDom } from './mutate';

const heal = { annotation: { type: 'expected-heal', description: 'heal' } };

test.describe('should heal', () => {
  test('H1 product grid: data-test renamed (list)', heal, async ({ page, homePage }) => {
    await mutateDom(page, [{ testId: 'product-name', renameTo: 'product-title' }]);
    await homePage.open();
    await expect(homePage.productNames.first()).toBeVisible();
    await homePage.productNames.first().click();
    await expect(page).toHaveURL(/\/product\//);
  });

  test('H2 add to cart: data-test renamed', heal, async ({ page, homePage, productPage, inStockProduct }) => {
    await mutateDom(page, [{ testId: 'add-to-cart', renameTo: 'btn-add-cart' }]);
    await homePage.open();
    await homePage.findAndOpenProduct(inStockProduct.name);
    await productPage.add(1);
    await expect(productPage.cartQuantity).toHaveText('1');
  });

  test('H3 search button: data-test removed', heal, async ({ page, homePage }) => {
    await mutateDom(page, [{ testId: 'search-submit', dropTestId: true }]);
    await homePage.open();
    await homePage.search('pliers');
    await expect
      .poll(async () => {
        const names = await homePage.productNames.allTextContents();
        return names.length > 0 && names.every((n) => /pliers/i.test(n));
      })
      .toBe(true);
  });

  test('H4 login email field: data-test renamed', heal, async ({ page, loginPage, customer }) => {
    await mutateDom(page, [{ testId: 'email', renameTo: 'login-email' }]);
    await loginPage.open();
    await loginPage.login(customer.email, customer.password);
    await expect(page).toHaveURL(/\/account$/);
  });

  test('H5 sort dropdown: data-test renamed', heal, async ({ page, homePage }) => {
    await mutateDom(page, [{ testId: 'sort', renameTo: 'sort-select' }]);
    await homePage.open();
    const before = await homePage.productNames.first().textContent();
    await homePage.sortBy('Price (Low - High)');
    await expect(homePage.productNames.first()).not.toHaveText(before ?? '');
    const prices = await homePage.prices();
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  test('H6 contact submit: data-test renamed', heal, async ({ page, contactPage }) => {
    await mutateDom(page, [{ testId: 'contact-submit', renameTo: 'send-message' }]);
    await contactPage.open();
    await contactPage.send({
      firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', subject: 'Customer service',
      message: 'Automated test message: checking the contact form accepts a valid submission end to end.',
    });
    await expect(contactPage.success).toBeVisible();
  });

  test('H7 login button: data-test renamed AND label changed', heal, async ({ page, loginPage, customer }) => {
    await mutateDom(page, [{ testId: 'login-submit', renameTo: 'signin-button', text: 'Sign in' }]);
    await loginPage.open();
    await loginPage.login(customer.email, customer.password);
    await expect(page).toHaveURL(/\/account$/);
  });

  test('H8 account heading: data-test renamed (assertion)', heal, async ({ page, loginPage, customer }) => {
    await mutateDom(page, [{ testId: 'page-title', renameTo: 'account-heading' }]);
    await loginPage.open();
    await loginPage.login(customer.email, customer.password);
    await expect(page).toHaveURL(/\/account$/);
    await expect(loginPage.accountTitle).toHaveText('My account');
  });
});
