import { test as base, expect } from '@playwright/test';
import { ToolshopApi, type Product } from '../api/ToolshopApi';
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
};

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
});

export { expect };

export const creds = {
  email: process.env.TOOLSHOP_EMAIL ?? 'customer@practicesoftwaretesting.com',
  password: process.env.TOOLSHOP_PASSWORD ?? 'welcome01',
};

/** Unique per run + worker so parallel/CI runs never collide on shared data. */
export const uniqueEmail = (prefix = 'qa') =>
  `${prefix}+${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`;
