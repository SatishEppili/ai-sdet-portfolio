import { BasePage } from './BasePage';

export class HomePage extends BasePage {
  readonly searchInput = this.byTestId('search-query');
  readonly searchSubmit = this.byTestId('search-submit');
  readonly sort = this.byTestId('sort');
  readonly productNames = this.byTestId('product-name');
  readonly productPrices = this.byTestId('product-price');
  readonly navSignIn = this.byTestId('nav-sign-in');
  readonly navMenu = this.byTestId('nav-menu');

  async open() {
    await this.goto('/');
    await this.ready(this.productNames.first());
  }

  async search(term: string) {
    await this.searchInput.fill(term);
    // Wait for the search API so callers never read the stale, unfiltered grid.
    await Promise.all([
      this.page.waitForResponse((r) => r.url().includes('/products/search') && r.ok()),
      this.searchSubmit.click(),
    ]);
  }

  async sortBy(label: string) {
    await this.sort.selectOption({ label });
  }

  /** Ticks a category checkbox in the sidebar by its visible label, e.g. "Hammer". */
  async filterByCategory(label: string) {
    // Callers should assert with expect.poll: the grid refreshes asynchronously after the check.
    await this.page.getByRole('checkbox', { name: label, exact: true }).check();
  }

  async openProduct(name: string) {
    // Exact match: "Pliers" must not match "Combination Pliers".
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await this.productNames.filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`) }).first().click();
  }

  /** Finds a product the way a shopper would (search, then click) instead of deep-linking to it. */
  async findAndOpenProduct(name: string) {
    await this.search(name);
    await this.openProduct(name);
  }

  /** Opens the cart from the header, staying inside the single-page app. */
  async openCart() {
    await this.byTestId('nav-cart').click();
  }

  async prices(): Promise<number[]> {
    return (await this.productPrices.allTextContents()).map((t) => Number(t.replace(/[^0-9.]/g, '')));
  }
}
