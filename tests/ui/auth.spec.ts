import { test, expect, creds } from '../../src/fixtures/test';

test.describe('Authentication', () => {
  test('customer can log in with valid credentials', async ({ page, loginPage, homePage }) => {
    await loginPage.open();
    await loginPage.login(creds.email, creds.password);

    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByTestId('page-title')).toHaveText('My account');
    await expect(homePage.navMenu).toContainText('Jane Doe');
  });

  test('invalid password shows an error', async ({ page, loginPage }) => {
    await loginPage.open();
    await loginPage.login(creds.email, 'wrong-password');

    await expect(loginPage.error).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login$/);
  });
});
