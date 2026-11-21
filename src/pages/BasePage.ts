import { test, expect, type Locator, type Page } from '@playwright/test';

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /** All locators go through here so the self-healing layer (Project 1) can wrap them later. */
  protected byTestId(id: string): Locator {
    return this.page.getByTestId(id);
  }

  async goto(path = '/') {
    await this.page.goto(path);
  }

  /**
   * Waits until `target` is visible. If the hosted demo serves its Cloudflare bot check
   * instead (common from CI datacenter IPs), the test is skipped and labelled as an
   * environment issue rather than timing out and looking like a product bug.
   */
  async ready(target: Locator) {
    const botCheck = this.page.getByRole('heading', { name: /performing security verification/i });
    await expect(target.or(botCheck).first()).toBeVisible({ timeout: 20_000 });
    if (await botCheck.isVisible()) {
      test.info().annotations.push({ type: 'environment', description: 'Cloudflare bot check served instead of the app' });
      test.skip(true, 'Blocked by the demo site\'s Cloudflare bot check (environment issue, not a product bug)');
    }
  }
}
