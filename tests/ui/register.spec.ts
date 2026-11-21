import { test, expect, uniqueEmail } from '../../src/fixtures/test';

test.describe('Customer registration', () => {
  test.beforeEach(async ({ registerPage }) => {
    await registerPage.open();
  });

  test('submitting an empty form flags the required fields', async ({ page, registerPage }) => {
    await registerPage.submit.click();

    for (const field of ['first-name', 'last-name', 'email', 'password']) {
      await expect(registerPage.error(field), `${field} should show an error`).toBeVisible();
    }
    await expect(page).toHaveURL(/\/auth\/register$/);
  });

  test('a new customer can register and is sent to the login page', async ({ page, registerPage }) => {
    await registerPage.register({
      firstName: 'Grace',
      lastName: 'Hopper',
      dob: '1990-12-09',
      country: 'Austria',
      postalCode: '1010',
      houseNumber: '12',
      street: 'Teststrasse',
      city: 'Vienna',
      state: 'Vienna',
      phone: '0123456789',
      email: uniqueEmail('register'),
      password: 'Sup3r$ecure!Pass2026',
    });

    await expect(page).toHaveURL(/\/auth\/login$/);
  });
});
