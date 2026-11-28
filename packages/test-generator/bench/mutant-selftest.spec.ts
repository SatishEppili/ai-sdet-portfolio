/**
 * Validates the benchmark's mutants with hand-written reference tests: each must PASS on the real
 * app and FAIL with its mutant applied. Without this, an ineffective mutant would make good
 * generated tests look like fake passes.
 *
 *   npx playwright test -c packages/test-generator/bench/selftest.config.ts                 (real app: all pass)
 *   SELFTEST_MUTATE=1 npx playwright test -c packages/test-generator/bench/selftest.config.ts (mutants: all "expected to fail")
 */
import { test, expect, uniqueEmail } from '../../../src/fixtures/test';
import { MUTANTS } from './mutants';

const mutate = process.env.SELFTEST_MUTATE === '1';

const cases: { id: string; mutant: string; run: (f: any) => Promise<void> }[] = [
  { id: 'S01', mutant: 'search-ignores-query', run: async ({ homePage }) => {
    await homePage.open(); await homePage.search('pliers');
    await expect.poll(async () => { const n = await homePage.productNames.allTextContents(); return n.length > 0 && n.every((x: string) => /pliers/i.test(x)); }).toBe(true);
  } },
  { id: 'S02', mutant: 'sort-reversed', run: async ({ homePage }) => {
    await homePage.open(); const before = await homePage.productNames.first().textContent();
    await homePage.sortBy('Price (Low - High)'); await expect(homePage.productNames.first()).not.toHaveText(before ?? '');
    const p = await homePage.prices(); expect(p).toEqual([...p].sort((a, b) => a - b));
  } },
  { id: 'S03', mutant: 'filter-leaks-product', run: async ({ homePage }) => {
    await homePage.open(); await homePage.filterByCategory('Hammer');
    await expect.poll(async () => { const n = await homePage.productNames.allTextContents(); return n.length > 0 && n.every((x: string) => /hammer/i.test(x)); }).toBe(true);
  } },
  { id: 'S04', mutant: 'cart-add-fails', run: async ({ homePage, productPage, inStockProduct }) => {
    await homePage.open(); await homePage.findAndOpenProduct(inStockProduct.name); await productPage.add(3);
    await expect(productPage.cartQuantity).toHaveText('3');
  } },
  { id: 'S05', mutant: 'login-rejects-valid', run: async ({ page, loginPage, customer }) => {
    await loginPage.open(); await loginPage.login(customer.email, customer.password);
    await expect(page).toHaveURL(/\/account$/); await expect(loginPage.accountTitle).toHaveText('My account');
  } },
  { id: 'S06', mutant: 'login-error-hidden', run: async ({ page, loginPage, customer }) => {
    await loginPage.open(); await loginPage.login(customer.email, 'wrong-password');
    await expect(loginPage.error).toBeVisible(); await expect(page).toHaveURL(/\/auth\/login$/);
  } },
  { id: 'S07', mutant: 'contact-rejects-valid', run: async ({ contactPage }) => {
    await contactPage.open();
    await contactPage.send({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', subject: 'Customer service', message: 'Reference test message that is comfortably longer than fifty characters.' });
    await expect(contactPage.success).toBeVisible();
  } },
  { id: 'S08', mutant: 'contact-email-error-hidden', run: async ({ contactPage }) => {
    await contactPage.open(); await contactPage.submit.click();
    await expect(contactPage.error('email')).toHaveText(/email is required/i);
  } },
  { id: 'S09', mutant: 'register-rejects-new', run: async ({ page, registerPage }) => {
    await registerPage.open();
    await registerPage.register({ firstName: 'Ref', lastName: 'Test', dob: '1990-01-01', country: 'Austria', postalCode: '1010', houseNumber: '1', street: 'S', city: 'Vienna', state: 'Vienna', phone: '0123456789', email: uniqueEmail('ref'), password: 'Sup3r$ecure!Pass2026' });
    await registerPage.waitForLoginRedirect(); await expect(page).toHaveURL(/\/auth\/login$/);
  } },
  { id: 'S10', mutant: 'product-price-wrong', run: async ({ homePage, productPage, inStockProduct }) => {
    await homePage.open(); await homePage.findAndOpenProduct(inStockProduct.name);
    await expect(productPage.price).toHaveText(inStockProduct.price.toFixed(2));
  } },
  { id: 'S11', mutant: 'payment-success-hidden', run: async ({ loginPage, homePage, productPage, checkoutPage, inStockProduct, customer }) => {
    await loginPage.open(); await loginPage.loginAsCustomer(customer.email, customer.password);
    await homePage.open(); await homePage.findAndOpenProduct(inStockProduct.name); await productPage.add(1); await homePage.openCart();
    await checkoutPage.proceedFromCart(); await checkoutPage.proceedAsSignedIn();
    await checkoutPage.fillAddress({ street: 'S 1', city: 'Vienna', state: 'Vienna', country: 'Austria', postalCode: '1010', houseNumber: '1' });
    await checkoutPage.pay('Cash on Delivery'); await expect(checkoutPage.paymentSuccess).toHaveText(/payment was successful/i);
  } },
  { id: 'S12', mutant: 'no-results-shows-all', run: async ({ page, homePage }) => {
    await homePage.open(); await homePage.search('zzz-no-such-tool');
    await expect(page.getByText(/no products found/i)).toBeVisible(); await expect(homePage.productNames).toHaveCount(0);
  } },
];

for (const c of cases) {
  // Playwright reads the parameter list to decide which fixtures to set up, so list them explicitly.
  test(`${c.id} reference ${mutate ? `fails on mutant ${c.mutant}` : 'passes on the real app'}`,
    async ({ page, homePage, productPage, loginPage, contactPage, registerPage, checkoutPage, inStockProduct, customer }) => {
      if (mutate) {
        test.fail(); // the reference test MUST fail on its mutant; if it passes, the mutant is ineffective
        await MUTANTS[c.mutant](page);
      }
      await c.run({ page, homePage, productPage, loginPage, contactPage, registerPage, checkoutPage, inStockProduct, customer });
    });
}
