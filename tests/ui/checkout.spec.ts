import { test, expect, creds } from '../../src/fixtures/test';

test.describe('Checkout', () => {
  test.beforeEach(async ({ page, loginPage, productPage, inStockProduct }) => {
    await loginPage.open();
    await loginPage.login(creds.email, creds.password);
    await expect(page).toHaveURL(/\/account$/);

    await productPage.open(inStockProduct.id);
    await productPage.add(2);
    await expect(productPage.cartQuantity).toHaveText('2');
  });

  test('cart shows the right line price and total', async ({ checkoutPage, inStockProduct }) => {
    await checkoutPage.open();

    await expect(checkoutPage.productTitles.first()).toHaveText(inStockProduct.name);
    await expect(checkoutPage.productQuantity.first()).toHaveValue('2');
    const expected = `$${(inStockProduct.price * 2).toFixed(2)}`;
    await expect(checkoutPage.linePrice.first()).toHaveText(expected);
    await expect(checkoutPage.cartTotal).toHaveText(expected);
  });

  test('signed-in customer can complete checkout with cash on delivery', async ({ checkoutPage }) => {
    await checkoutPage.open();
    await checkoutPage.proceedFromCart();
    await checkoutPage.proceedAsSignedIn();
    await checkoutPage.fillAddress({
      street: 'Teststrasse 1',
      city: 'Vienna',
      state: 'Vienna',
      country: 'Austria',
      postalCode: '1010',
      houseNumber: '1',
    });
    await checkoutPage.pay('Cash on Delivery');

    await expect(checkoutPage.paymentSuccess).toHaveText(/payment was successful/i);
  });
});
