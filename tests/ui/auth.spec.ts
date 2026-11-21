import { test, expect } from '../../src/fixtures/test';

test.describe('Authentication', () => {
  test('customer can log in with valid credentials', async ({ page, loginPage, homePage, customer }) => {
    await loginPage.open();
    await loginPage.loginAsCustomer(customer.email, customer.password);

    await expect(page).toHaveURL(/\/account$/);
    await expect(loginPage.accountTitle).toHaveText('My account');
    await expect(homePage.navMenu).toContainText(`${customer.firstName} ${customer.lastName}`);
  });

  test('invalid password shows an error', async ({ page, loginPage, customer }) => {
    // Uses this test's own throwaway account, so failed attempts can never lock a shared user.
    await loginPage.open();
    await loginPage.login(customer.email, 'wrong-password');

    await expect(loginPage.error).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login$/);
  });
});
