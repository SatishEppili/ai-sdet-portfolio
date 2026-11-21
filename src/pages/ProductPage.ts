import { BasePage } from './BasePage';

export class ProductPage extends BasePage {
  readonly name = this.byTestId('product-name');
  readonly price = this.byTestId('unit-price');
  readonly quantity = this.byTestId('quantity');
  readonly addToCart = this.byTestId('add-to-cart');
  readonly cartQuantity = this.byTestId('cart-quantity');

  async open(productId: string) {
    await this.goto(`/product/${productId}`);
    await this.name.waitFor();
  }

  async add(qty = 1) {
    await this.quantity.fill(String(qty));
    await this.addToCart.click();
  }
}
