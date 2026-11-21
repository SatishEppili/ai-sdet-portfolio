import { test, expect } from '../../src/fixtures/test';

test.describe('Contact form', () => {
  test.beforeEach(async ({ contactPage }) => {
    await contactPage.open();
  });

  test('submitting an empty form shows a required error for every field', async ({ contactPage }) => {
    await contactPage.submit.click();

    await expect(contactPage.error('first-name')).toHaveText(/first name is required/i);
    await expect(contactPage.error('last-name')).toHaveText(/last name is required/i);
    await expect(contactPage.error('email')).toHaveText(/email is required/i);
    await expect(contactPage.error('subject')).toHaveText(/subject is required/i);
    await expect(contactPage.error('message')).toHaveText(/message is required/i);
  });

  test('a valid message is accepted', async ({ contactPage }) => {
    await contactPage.send({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      subject: 'Customer service',
      message: 'Automated test message: checking the contact form accepts a valid submission end to end.',
    });

    await expect(contactPage.success).toBeVisible();
  });
});
