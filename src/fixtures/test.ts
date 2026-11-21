import { test as base, expect } from '@playwright/test';
import { ToolshopApi, type Customer, type Product } from '../api/ToolshopApi';
import { CheckoutPage } from '../pages/CheckoutPage';
import { ContactPage } from '../pages/ContactPage';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { ProductPage } from '../pages/ProductPage';
import { RegisterPage } from '../pages/RegisterPage';

type Fixtures = {
  homePage: HomePage;
  loginPage: LoginPage;
  productPage: ProductPage;
  contactPage: ContactPage;
  registerPage: RegisterPage;
  checkoutPage: CheckoutPage;
  api: ToolshopApi;
  /** A product that is in stock right now (looked up via the API, never hard-coded). */
  inStockProduct: Product;
  /** A freshly registered customer owned by this test (never the shared demo account). */
  customer: Customer;
  /** Auto: records network/console problems and attaches them to failed tests (input for AI triage). */
  diagnostics: void;
};

const MAX_ENTRIES = 25;
const clip = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Single entry point for tests. AI fixtures (self-healing, triage hooks) get added here later. */
export const test = base.extend<Fixtures>({
  homePage: async ({ page }, use) => use(new HomePage(page)),
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  productPage: async ({ page }, use) => use(new ProductPage(page)),
  contactPage: async ({ page }, use) => use(new ContactPage(page)),
  registerPage: async ({ page }, use) => use(new RegisterPage(page)),
  checkoutPage: async ({ page }, use) => use(new CheckoutPage(page)),
  api: async ({ request }, use) => use(new ToolshopApi(request)),
  inStockProduct: async ({ api }, use) => use(await api.inStockProduct()),
  customer: async ({ api }, use) => use(await api.registerCustomer()),

  diagnostics: [
    async ({ page }, use, testInfo) => {
      const consoleErrors: string[] = [];
      const failedRequests: { method: string; url: string; error: string }[] = [];
      const httpErrors: { method: string; url: string; status: number; body?: string }[] = [];
      const pending: Promise<void>[] = [];

      page.on('console', (m) => {
        if (m.type() === 'error' && consoleErrors.length < MAX_ENTRIES) consoleErrors.push(clip(m.text()));
      });
      page.on('pageerror', (e) => {
        if (consoleErrors.length < MAX_ENTRIES) consoleErrors.push(clip(`Uncaught: ${e.message}`));
      });
      page.on('requestfailed', (r) => {
        if (failedRequests.length < MAX_ENTRIES)
          failedRequests.push({ method: r.method(), url: clip(r.url(), 200), error: r.failure()?.errorText ?? 'unknown' });
      });
      page.on('response', (r) => {
        if (r.status() < 400 || httpErrors.length >= MAX_ENTRIES) return;
        const entry = { method: r.request().method(), url: clip(r.url(), 200), status: r.status() } as (typeof httpErrors)[number];
        httpErrors.push(entry);
        pending.push(r.text().then((t) => void (entry.body = clip(t)), () => undefined));
      });

      await use();

      if (testInfo.status !== testInfo.expectedStatus) {
        await Promise.allSettled(pending);
        await testInfo.attach('diagnostics', {
          contentType: 'application/json',
          body: JSON.stringify({ url: page.url(), consoleErrors, failedRequests, httpErrors }, null, 2),
        });
      }
    },
    { auto: true },
  ],
});

export { expect };

/** Unique per call so parallel/CI runs never collide on shared data. */
export const uniqueEmail = (prefix = 'qa') =>
  `${prefix}+${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`;
