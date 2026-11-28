# Generated specs (benchmark run)

Every spec the generator produced, as written (the benchmark swaps the fixture import to `../bench/fixtures` to apply mutants).

## S01: useful: caught the mutant

> As a shopper, when I search for "pliers" the catalog shows only products whose name contains "pliers".

```ts
import { test, expect } from '../../../src/fixtures/test';

test.describe('Product search filtering', () => {
  test('searching for "pliers" shows only matching products', async ({ homePage }) => {
    // Open home page and perform search
    await homePage.open();
    await homePage.search('pliers');

    // Wait for the product list to be ready (using the first product as a sentinel)
    await homePage.ready(homePage.productNames.first());

    // Get all visible product names
    const names = await homePage.productNames.allTextContents();

    // Ensure at least one product is displayed
    expect(names.length).toBeGreaterThan(0);

    // Assert each product name contains the search term (case‑insensitive)
    for (const name of names) {
      expect(name.toLowerCase()).toContain('pliers');
    }
  });
});
```

## S02: useful: caught the mutant

> As a shopper, I can sort the catalog by "Price (Low - High)" and the listed prices are in ascending order.

```ts
import { test, expect } from '../../../src/fixtures/test';

test.describe('Catalog sorting', () => {
  test('prices are displayed in ascending order after sorting by "Price (Low - High)"', async ({ homePage }) => {
    // Open home page and wait for sort control to be ready
    await homePage.open();
    await homePage.ready(homePage.sort);

    // Apply the sorting option
    await homePage.sortBy('Price (Low - High)');

    // Poll until the price list stabilises and then verify it is strictly ascending
    await expect.poll(async () => {
      const prices = await homePage.prices();
      // Return true only when the list is in ascending order
      for (let i = 1; i < prices.length; i++) {
        if (prices[i] < prices[i - 1]) return false;
      }
      return true;
    }).toBeTruthy();
  });
});
```

## S03: useful: caught the mutant

> As a shopper, when I filter the catalog by the "Hammer" category, every product shown is a hammer (its name contains "hammer").

```ts
import { test, expect } from '../../../src/fixtures/test';

test.describe('Catalog filtering by category', () => {
  test('filtering by "Hammer" shows only hammer products', async ({ homePage }) => {
    // Open the home page
    await homePage.open();

    // Apply the Hammer category filter
    await homePage.filterByCategory('Hammer');

    // Wait until at least one product is displayed.
    await expect.poll(async () => {
      return await homePage.productNames.count();
    }).toBeGreaterThan(0);

    // Verify that every displayed product name contains "hammer" (case‑insensitive).
    await expect.poll(async () => {
      const names = await homePage.productNames.allTextContents();
      return names.every((n) => /hammer/i.test(n));
    }, { timeout: 15000 }).toBeTruthy();
  });
});
```

## S04: useful: caught the mutant

> As a shopper, I can open an in-stock product, add 3 of it to my cart, and the cart badge in the header shows 3.

```ts
import { test, expect } from '../../../src/fixtures/test';

test.describe('Shopping cart badge updates', () => {
  test('adding three of an in‑stock product updates the header badge', async ({ homePage, productPage, inStockProduct }) => {
    // Navigate as a shopper would
    await homePage.open();
    await homePage.findAndOpenProduct(inStockProduct.name);

    // Add three units to the cart
    await productPage.add(3);

    // The cart badge in the header should now show "3"
    await expect(productPage.cartQuantity).toHaveText('3');
  });
});
```

## S05: useful: caught the mutant

> As a registered customer, I can log in with my email and password and land on my account page titled "My account".

```ts
import { test, expect } from '../../../src/fixtures/test';

test.describe('Login', () => {
  test('registered customer can log in and see account page title', async ({ loginPage, customer }) => {
    // Open the login page
    await loginPage.open();

    // Log in with the freshly registered customer's credentials
    await loginPage.loginAsCustomer(customer.email, customer.password);

    // Verify that the account page title is displayed and contains the expected text
    await expect(loginPage.accountTitle).toHaveText('My account');
  });
});
```

## S06: useful: caught the mutant

> As a registered customer, if I log in with a wrong password I see a login error and stay on the login page.

```ts
import { test, expect } from '../../../src/fixtures/test';

test.describe('Login error handling', () => {
  test('shows error and stays on login page when password is wrong', async ({ loginPage, customer }) => {
    // Open the login page
    await loginPage.open();

    // Attempt to log in with the correct email but an incorrect password
    const wrongPassword = 'incorrect-password-123';
    await loginPage.login(customer.email, wrongPassword);

    // Expect a validation error to be shown
    await expect(loginPage.error).toBeVisible();
    // The error message should mention authentication failure (implementation‑specific wording)
    await expect(loginPage.error).toHaveText(/invalid|incorrect|password/i);

    // Ensure we are still on the login page – the account title should not be present
    await expect(loginPage.accountTitle).toBeHidden();
  });
});
```

## S07: useful: caught the mutant

> As a visitor, I can send a message through the contact form (subject "Customer service", a message of at least 50 characters) and I see a thank-you confirmation.

```ts
import { test, expect } from '../../../src/fixtures/test';

test.describe('Contact form', () => {
  test('visitor can send a customer service message and sees thank‑you confirmation', async ({ contactPage }) => {
    // Open the contact page
    await contactPage.open();

    // Prepare a valid contact message
    const msg = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      subject: 'Customer service',
      message: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor.', // >50 chars
    };

    // Send the message using the page‑object helper
    await contactPage.send(msg);

    // Verify the thank‑you confirmation appears
    await expect(contactPage.success).toHaveText(/thank.*you.*message/i);
  });
});
```

## S08: useful: caught the mutant

> As a visitor, if I submit the contact form empty I see validation errors, including one telling me the email is required.

```ts
import { test, expect } from '../../../src/fixtures/test';

test.describe('Contact form validation', () => {
  test('shows required field errors when submitted empty, including email required', async ({ contactPage }) => {
    // Open the contact page
    await contactPage.open();

    // Submit the form without filling any fields
    await contactPage.submit.click();

    // Expect validation error for each required field; specifically check email error message
    await expect(contactPage.error('email')).toHaveText(/email.*required/i);
  });
});
```

## S09: useful: caught the mutant

> As a new visitor, I can register an account with my details (using a unique email) and I am sent to the login page afterwards.

```ts
import { test, expect, uniqueEmail } from '../../../src/fixtures/test';

test.describe('Registration', () => {
  test('new visitor can register and is sent to login page', async ({ registerPage, loginPage }) => {
    const email = uniqueEmail('reg');
    const newCustomer = {
      firstName: 'Test',
      lastName: 'User',
      dob: '1990-01-01',
      country: 'Austria',
      postalCode: '1010',
      houseNumber: '1',
      street: 'Teststrasse',
      city: 'Vienna',
      state: 'Vienna',
      phone: '4312345678', // numeric only
      email,
      // Use a password unlikely to be in known data leaks
      password: 'Str0ng!Pass#2024',
    };

    await registerPage.open();
    await registerPage.register(newCustomer);
    await registerPage.waitForLoginRedirect();

    // After successful registration the app should show the login form.
    await expect(loginPage.email).toBeVisible();
  });
});
```

## S10: useful: caught the mutant

> As a shopper, the product page of an in-stock product shows the same unit price as the catalog API reports for it.

```ts
import { test, expect } from '../../../src/fixtures/test';

test.describe('Product page price verification', () => {
  test('unit price matches catalog API for an in‑stock product', async ({ productPage, inStockProduct }) => {
    await productPage.open(inStockProduct.id);

    const expectedPrice = inStockProduct.price.toFixed(2);
    await expect(productPage.price).toHaveText(expectedPrice);
  });
});
```

## S11: useful: caught the mutant

> As a signed-in customer, I can buy an in-stock product: add it to the cart, go through checkout with my address, pay with "Cash on Delivery", and see that the payment was successful.

```ts
import { test, expect } from '../../../src/fixtures/test';

test.describe('Signed-in customer can purchase an in‑stock product with Cash on Delivery', () => {
  test.beforeEach(async ({ loginPage, homePage, productPage, inStockProduct, customer }) => {
    // Log in as the freshly created customer
    await loginPage.open();
    await loginPage.loginAsCustomer(customer.email, customer.password);

    // Navigate like a shopper: home → search → product → add to cart
    await homePage.open();
    await homePage.findAndOpenProduct(inStockProduct.name);
    await productPage.add(1);
    await expect(productPage.cartQuantity).toHaveText('1');

    // Open the cart (single‑page app navigation)
    await homePage.openCart();
  });

  test('complete checkout with cash on delivery and see success message', async ({ checkoutPage, inStockProduct }) => {
    // Move from cart to checkout
    await checkoutPage.proceedFromCart();
    // Already signed in, just continue
    await checkoutPage.proceedAsSignedIn();

    // Fill required address fields (using static but valid data)
    await checkoutPage.fillAddress({
      street: 'Test Street 1',
      city: 'Vienna',
      state: 'Vienna',
      country: 'Austria',
      postalCode: '1010',
      houseNumber: '1',
    });

    // Pay with Cash on Delivery
    await checkoutPage.pay('Cash on Delivery');

    // Verify payment success message
    await expect(checkoutPage.paymentSuccess).toHaveText(/payment was successful/i);
  });
});
```

## S12: useful: caught the mutant

> As a shopper, when I search for a term that matches nothing ("zzz-no-such-tool"), I see a "no products found" message and no products are listed.

```ts
import { test, expect } from '../../../src/fixtures/test';

test.describe('Search with no results', () => {
  test('shows no products message when search yields nothing', async ({ homePage, page }) => {
    // Open home page
    await homePage.open();

    // Perform a search that matches no products
    await homePage.search('zzz-no-such-tool');
    await homePage.searchSubmit.click();

    // Expect the product list to be empty
    await expect(homePage.productNames).toHaveCount(0);

    // Expect a "no products found" message to be visible. No page object covers this, so we use a raw locator.
    const noResultsMessage = page.getByText(/no products found/i);
    await expect(noResultsMessage).toBeVisible();
  });
});
```

## S13: gap detected by tool (2 raw locators)

> As a signed-in customer, I can add a product to my favourites and then see it listed on my favourites page.

```ts
import { test, expect } from '../../../src/fixtures/test';

test.describe('Favourites', () => {
  test('signed-in customer can add a product to favourites and see it listed', async ({ homePage, loginPage, customer, inStockProduct, page }) => {
    // Log in as the freshly created customer
    await loginPage.open();
    await loginPage.loginAsCustomer(customer.email, customer.password);

    // Navigate to the product as a shopper would
    await homePage.open();
    await homePage.findAndOpenProduct(inStockProduct.name);

    // Add to favourites – no page object method exists, using a raw selector
    const favouriteButton = page.getByRole('button', { name: /add to favourites/i });
    await favouriteButton.click();

    // Directly navigate to the favourites page (fallback when UI link is unreliable)
    await homePage.goto('/favourites');

    // Wait for the favourites list to be present
    const favouritesList = page.getByTestId('favourite-list');
    await expect(favouritesList).toBeVisible();

    // Verify the product appears in the favourites list
    const favouriteItem = favouritesList.getByRole('listitem').filter({ hasText: inStockProduct.name });
    await expect(favouriteItem).toBeVisible();
  });
});
```

## S14: gap detected by tool (1 raw locators)

> As a visitor, I can switch the site language to German and the main navigation is shown in German.

```ts
import { test, expect } from '../../../src/fixtures/test';

test.describe('Language switch', () => {
  test('visitor can switch site language to German and see navigation in German', async ({ page, homePage }) => {
    // Open the home page
    await homePage.open();

    // The language selector is likely a <select> element with a visible label "Language" or "Sprache".
    // Locate it via its label.
    const languageSelect = page.getByLabel(/language|sprache/i);
    await expect(languageSelect).toBeVisible();

    // Choose the German option (value or visible text "Deutsch").
    await languageSelect.selectOption({ label: /deutsch/i });

    // Wait for the UI to reflect the language change – e.g., the navigation sign‑in link text updates.
    const navSignInGerman = homePage.navSignIn;
    await expect(navSignInGerman).toHaveText(/anmelden/i);
  });
});
```
