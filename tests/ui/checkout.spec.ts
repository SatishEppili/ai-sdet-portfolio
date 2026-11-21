import { test, expect } from '../../src/fixtures/test';

test.describe('Checkout', () => {
  test.beforeEach(async ({ loginPage, homePage, productPage, inStockProduct, customer }) => {
    await loginPage.open();
    await loginPage.loginAsCustomer(customer.email, customer.password);

    // Navigate like a shopper (home -> search -> product -> cart) rather than deep-linking.
    await homePage.open();
    await homePage.findAndOpenProduct(inStockProduct.name);
    await productPage.add(2);
    await expect(productPage.cartQuantity).toHaveText('2');
    await homePage.openCart();
  });

  test('cart shows the right line price and total', async ({ checkoutPage, inStockProduct }) => {
    await expect(checkoutPage.productTitles.first()).toHaveText(inStockProduct.name);
    await expect(checkoutPage.productQuantity.first()).toHaveValue('2');
    const expected = `$${(inStockProduct.price * 2).toFixed(2)}`;
    await expect(checkoutPage.linePrice.first()).toHaveText(expected);
    await expect(checkoutPage.cartTotal).toHaveText(expected);
  });

  test('signed-in customer can complete checkout with cash on delivery', async ({ checkoutPage }) => {
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
