import type { Page, Request, TestInfo } from '@playwright/test';
import { API_URL } from '../../../../src/api/ToolshopApi';
import type { Category } from '../../src/types';

export { test, expect } from '../../../../src/fixtures/test';
export { API_URL };

/** Ground-truth label read back by the benchmark. */
export const truth = (category: Category) => ({ annotation: { type: 'expected-category', description: category } });

export const isApi = (url: URL, path: RegExp) => url.href.startsWith(API_URL) && path.test(url.pathname + url.search);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Faults are injected from beforeEach, keyed by case id ("#07"), so the failing test body
 * (which is what ends up in the error snippet the model sees) reads like a normal test.
 * File names, titles and describe blocks are deliberately neutral: no answer leakage.
 */
export type Fault = (page: Page, info: TestInfo) => Promise<unknown>;
export const caseId = (info: TestInfo) => info.title.slice(0, 3);

/** Simulates a backend defect by rewriting a real API response. */
// Note: the Toolshop UI uses the HTTP QUERY method with filters/sort in the request body,
// so match on the path and (optionally) the body, not on a query string.
export async function mutateApi(page: Page, path: RegExp, fn: (body: any) => any, when?: (req: Request) => boolean) {
  await page.route((u) => isApi(u, path), async (route) => {
    if (when && !when(route.request())) return route.fallback();
    const res = await route.fetch();
    await route.fulfill({ response: res, json: fn(await res.json()) });
  });
}
