import type { Page } from '@playwright/test';

/** A DOM change a developer might make, applied to every element with that data-test. */
export interface Mutation {
  testId: string;
  /** Rename the data-test attribute. */
  renameTo?: string;
  /** Drop the data-test attribute entirely. */
  dropTestId?: boolean;
  /** Change the visible label (button text, or value for <input type=submit>). */
  text?: string;
  /** Delete the element: the feature is gone, so healing must refuse. */
  remove?: boolean;
}

/**
 * Applies mutations before the app's scripts run and keeps applying them as Angular renders,
 * so the test sees a page that was "refactored" after the fingerprints were recorded.
 */
export async function mutateDom(page: Page, mutations: Mutation[]) {
  await page.addInitScript((rules: Mutation[]) => {
    const apply = () => {
      for (const r of rules) {
        document.querySelectorAll(`[data-test="${r.testId}"]`).forEach((el) => {
          if (r.remove) {
            el.remove();
            return;
          }
          if (r.text !== undefined) {
            if (el instanceof HTMLInputElement) {
              el.value = r.text;
              el.setAttribute('value', r.text);
            } else {
              el.textContent = r.text;
            }
          }
          if (r.dropTestId) el.removeAttribute('data-test');
          else if (r.renameTo) el.setAttribute('data-test', r.renameTo);
        });
      }
    };
    new MutationObserver(apply).observe(document, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', apply);
  }, mutations);
}
