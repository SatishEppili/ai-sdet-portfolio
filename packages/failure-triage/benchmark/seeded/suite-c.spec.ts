// Ground truth: ENVIRONMENT (app logic and test code are fine; the infrastructure is not).
//  #11 API host refuses connections · #12 API behind a 503 gateway · #13 wrong host in config
//  #14 bot-protection challenge page · #15 shared demo account locked (423)
import { test, expect, truth, caseId, API_URL, type Fault } from './helpers';

const CHALLENGE_HTML = `<!doctype html><html><head><title>Just a moment...</title></head><body>
<main><h1>practicesoftwaretesting.com</h1><h2>Performing security verification</h2>
<p>This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot.</p></main>
<footer>Ray ID: <code>8f1c2a9e7b3d4e5f</code> Performance and Security by Cloudflare</footer></body></html>`;

const faults: Record<string, Fault> = {
  '#11': (page) => page.route((u) => u.href.startsWith(API_URL), (r) => r.abort('connectionrefused')),
  '#12': (page) =>
    page.route((u) => u.href.startsWith(API_URL), (r) =>
      r.fulfill({
        status: 503, contentType: 'text/html',
        body: '<html><head><title>503 Service Temporarily Unavailable</title></head><body><center><h1>503 Service Temporarily Unavailable</h1></center><hr><center>nginx</center></body></html>',
      }),
    ),
  '#14': (page) =>
    page.route((u) => !u.href.startsWith(API_URL) && u.pathname === '/', (r) =>
      r.fulfill({ status: 403, contentType: 'text/html', body: CHALLENGE_HTML }),
    ),
  '#15': (page) =>
    page.route((u) => u.href.startsWith(API_URL) && u.pathname.endsWith('/users/login'), (r) =>
      r.fulfill({ status: 423, json: { error: 'Account locked, too many failed attempts. Please contact the administrator.' } }),
    ),
};

// #13: the kind of value a stale STAGING_URL env var would leave in a test.
const STAGING_URL = 'https://toolshop-staging.invalid/';

test.describe('Toolshop', () => {
  test.beforeEach(async ({ page }, info) => faults[caseId(info)]?.(page, info));

  test('#11 home page lists products', truth('environment'), async ({ page, homePage }) => {
    await page.goto('/');
    await expect(homePage.productNames.first()).toBeVisible();
  });

  test('#12 catalog loads on the home page', truth('environment'), async ({ page, homePage }) => {
    await page.goto('/');
    await expect(homePage.productNames.first()).toBeVisible();
  });

  test('#13 opens the staging shop', truth('environment'), async ({ page, homePage }) => {
    await page.goto(STAGING_URL);
    await expect(homePage.productNames.first()).toBeVisible();
  });

  test('#14 landing page shows products', truth('environment'), async ({ page, homePage }) => {
    await page.goto('/');
    await expect(homePage.productNames.first()).toBeVisible();
  });

  test('#15 demo customer can log in', truth('environment'), async ({ page, loginPage }) => {
    await loginPage.open();
    await loginPage.login('customer@practicesoftwaretesting.com', 'welcome01');
    await expect(page).toHaveURL(/\/account$/);
  });
});
