import { type Locator, type Page } from '@playwright/test';

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /** All locators go through here so the self-healing layer (Project 1) can wrap them later. */
  protected byTestId(id: string): Locator {
    return this.page.getByTestId(id);
  }

  async goto(path = '/') {
    await this.page.goto(path);
  }
}
